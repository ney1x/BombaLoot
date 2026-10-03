import { NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/guards";
import { getPool } from "@/server/db/client";
import { apiErrorToResponse } from "@/server/http/respond";
import { getAccountLoyaltyCoupons } from "@/server/services/loyalty";

/**
 * Lo que usa `CheckoutView` (componente cliente) para ofrecer "usar mi
 * cupón de fidelización" — reconcilia contra `purchases_count` antes de
 * responder, así que un cupón recién ganado aparece sin que nadie tenga que
 * refrescar nada aparte. Sin sesión, simplemente no hay cupones (un
 * invitado no tiene cuenta a la que atarlos).
 */
export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ available: [], redeemed: [] });
    }
    const coupons = await getAccountLoyaltyCoupons(getPool(), session.userId, session.purchasesCount);
    return NextResponse.json(coupons);
  } catch (error) {
    return apiErrorToResponse(error);
  }
}
