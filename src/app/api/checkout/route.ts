import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateGuestKey } from "@/server/auth/guest";
import { getCurrentSession } from "@/server/auth/guards";
import { setOrderAccessCookie } from "@/server/auth/cookies";
import { getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { checkoutSchema } from "@/server/services/checkout-schemas";
import { checkoutCart, type CheckoutOwner } from "@/server/services/checkout-service";
import { MissingOwnerError } from "@/server/services/errors";

/**
 * Punto de entrada único del checkout real. El cliente manda `productId` +
 * `quantity` por línea — nunca precio, descuento, ni total: eso se
 * recalcula acá contra la base, dentro de `checkoutCart`.
 */
export async function POST(request: NextRequest) {
  try {
    const body = checkoutSchema.parse(await request.json());
    const meta = requestMeta(request);
    const session = await getCurrentSession();

    let owner: CheckoutOwner;
    if (session) {
      // El nombre/email de la cuenta son el default, pero un pedido puntual
      // puede pedir que se registre con otros — hoy el único lugar que
      // ofrece ese campo editable estando logueado es el bloque de Nequi
      // (pagás por alguien más, o con datos distintos a los de tu cuenta).
      // `userId` sigue siendo el de la sesión siempre: el pedido cuenta
      // para el historial/fidelización de esa cuenta pase lo que pase acá.
      owner = {
        type: "user",
        userId: session.userId,
        email: body.buyerEmail?.trim() || session.email,
        name: body.buyerName?.trim() || session.name,
        purchasesCount: session.purchasesCount,
      };
    } else {
      if (!body.buyerEmail) {
        throw new MissingOwnerError();
      }
      const guestKey = await getOrCreateGuestKey();
      owner = { type: "guest", guestKey, email: body.buyerEmail, name: body.buyerName ?? null };
    }

    const rateLimitKey = session ? `user:${session.userId}` : `ip:${meta.ip}`;

    const result = await checkoutCart(getPool(), {
      lines: body.lines,
      idempotencyKey: body.idempotencyKey,
      owner,
      discountCode: body.discountCode,
      loyaltyCouponId: body.loyaltyCouponId,
      buyerLegalId: body.buyerLegalId,
      rateLimitKey,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const response = NextResponse.json({ order: result });

    // Cookie httpOnly de acceso, solo para invitados — un usuario logueado
    // ya tiene acceso vía su propia sesión, sumarle esta sería puro ruido.
    // Reemplaza al `accessToken` viajando por URL/sessionStorage en el resto
    // del flujo (hallazgo de la auditoría de seguridad, 2026-09-04).
    if (!session && result.accessToken) {
      setOrderAccessCookie(response.cookies, result.orderId, result.accessToken);
    }

    return response;
  } catch (error) {
    return apiErrorToResponse(error);
  }
}
