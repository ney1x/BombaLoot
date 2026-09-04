import { describe, expect, it } from "vitest";
import { PAYMENT_METHODS } from "@/lib/checkout";

/**
 * Regresión de un error real: `card` decía `region: "Colombia"` y su
 * descripción sugería que solo PayPal servía para comprar desde el
 * exterior. Wompi (proveedor real del método `card`) procesa
 * Visa/Mastercard/Amex tanto colombianas como emitidas en el exterior —
 * confirmado contra la documentación de soporte de Wompi, no supuesto.
 * Nequi y PSE sí son exclusivamente colombianos (piden cuenta bancaria o
 * Nequi local) — esos dos no cambian.
 */
describe("PAYMENT_METHODS — región real por método", () => {
  it("nequi y pse siguen marcados como exclusivamente colombianos", () => {
    const nequi = PAYMENT_METHODS.find((m) => m.id === "nequi")!;
    const pse = PAYMENT_METHODS.find((m) => m.id === "pse")!;
    expect(nequi.region).toBe("Colombia");
    expect(pse.region).toBe("Colombia");
  });

  it("card no está marcado como exclusivo de Colombia — Wompi acepta tarjetas del exterior", () => {
    const card = PAYMENT_METHODS.find((m) => m.id === "card")!;
    expect(card.region).not.toBe("Colombia");
    expect(card.description.toLowerCase()).not.toMatch(/procesado en colombia\.?$/);
  });
});
