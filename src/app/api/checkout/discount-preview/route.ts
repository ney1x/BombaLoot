import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { checkoutLineSchema } from "@/server/services/checkout-schemas";
import { DISCOUNT_PREVIEW_LIMITS } from "@/server/services/checkout-limits";
import { lookupActiveProducts } from "@/server/services/checkout-service";
import { previewDiscountCode } from "@/server/services/admin-discounts";
import { checkRateLimit } from "@/server/services/rate-limit";

const schema = z.object({
  code: z.string().trim().min(1).max(40),
  lines: z.array(checkoutLineSchema).min(1),
  buyerEmail: z.string().trim().toLowerCase().email().max(320).optional(),
});

/**
 * Vista previa de solo lectura del cupón — el checkout la llama al tipear
 * un código para mostrar el descuento antes de confirmar, sin gastar un
 * uso ni bloquear la fila (ver `previewDiscountCode`). El canje real, con
 * el descuento fijado en el pedido, pasa recién en `POST /api/checkout`.
 */
export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const session = await getCurrentSession();
    const buyerEmail = session?.email ?? body.buyerEmail ?? "";

    const db = getDb();

    // Sin sesión obligatoria acá (el preview corre para invitados también),
    // así que la clave combina usuario o IP — mismo criterio que
    // `/api/checkout`. Sin esto, el endpoint es un oráculo de fuerza bruta
    // para descubrir cupones de distribución restringida.
    const meta = requestMeta(request);
    const rateLimitKey = session ? `user:${session.userId}` : `ip:${meta.ip}`;
    await checkRateLimit(db, `discount-preview:${rateLimitKey}`, DISCOUNT_PREVIEW_LIMITS.maxPerWindow, DISCOUNT_PREVIEW_LIMITS.windowSeconds);

    const products = await lookupActiveProducts(
      db,
      body.lines.map((l) => l.productId),
    );

    const lines = body.lines.map((l) => {
      const product = products.get(l.productId);
      if (!product) return null;
      return {
        productId: l.productId,
        gameId: product.gameId,
        lineTotalCop: product.priceCop * l.quantity,
      };
    });
    const validLines = lines.filter((l): l is NonNullable<typeof l> => l !== null);
    const subtotalCop = validLines.reduce((sum, l) => sum + l.lineTotalCop, 0);

    const result = await previewDiscountCode(db, {
      code: body.code,
      subtotalCop,
      lines: validLines,
      buyerEmail,
    });

    return NextResponse.json({ discount: result });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}
