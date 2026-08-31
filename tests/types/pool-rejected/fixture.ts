// Fixture NEGATIVA para el hallazgo C1.
//
// Este archivo NO debe compilar. `getDb()` devuelve `Db` (el pool en
// autocommit), y `createReservation`/`claimCodesForProduct`/
// `attachCodesToOrderItem`/`confirmOrderPayment` piden `TxDb` — un tipo que
// solo `beginTransaction`/`withTransaction` puede producir. Pasar el pool acá
// debe fallar en `tsc`, no en producción.
//
// Verificado por tests/type-guards.test.ts, que corre
// `tsc --noEmit -p tests/types/pool-rejected/tsconfig.json` y exige que
// falle mencionando el símbolo de marca.
import { getDb } from "@/server/db/client";
import { createReservation } from "@/server/services/inventory";

export async function shouldNotCompile() {
  // @ts-expect-error C1: getDb() es Db (pool), no TxDb — no debe compilar.
  await createReservation(getDb(), {
    owner: { guestKey: "x" },
    lines: [{ productId: "p", quantity: 1 }],
  });
}
