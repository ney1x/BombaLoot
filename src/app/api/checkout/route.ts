import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateGuestKey } from "@/server/auth/guest";
import { getCurrentSession } from "@/server/auth/guards";
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
      owner = {
        type: "user",
        userId: session.userId,
        email: session.email,
        name: session.name,
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
      rateLimitKey,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({ order: result });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}
