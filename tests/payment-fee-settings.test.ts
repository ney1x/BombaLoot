import { describe, expect, it } from "vitest";
import { estimateWompiFeeCop, type PaymentFeeSettings } from "@/server/services/payment-fee-settings";

/**
 * `estimateWompiFeeCop` — Wompi no manda la comisión real por API (a
 * diferencia de PayPal), así que este cálculo es lo único que alimenta el
 * neto de Wompi en el dashboard. Los valores default (265/700/1900) son el
 * Plan Avanzado publicado por Wompi: 2,65% + $700 COP + IVA 19% sobre la
 * comisión — verificados acá contra una venta real: $1.500 COP por Nequi
 * dejó ~$600 netos (el usuario lo reportó en vivo), que es exactamente lo
 * que da esta fórmula.
 */

const DEFAULT_SETTINGS: PaymentFeeSettings = {
  wompiPercentageBp: 265,
  wompiFixedCop: 700,
  wompiIvaBp: 1900,
  updatedAt: new Date(),
  updatedByName: null,
};

describe("estimateWompiFeeCop", () => {
  it("regresión: $1.500 vía Nequi deja ~$600 netos (caso real reportado)", () => {
    const fee = estimateWompiFeeCop(1500, DEFAULT_SETTINGS);
    const net = 1500 - fee;
    expect(net).toBeGreaterThanOrEqual(600);
    expect(net).toBeLessThanOrEqual(650);
  });

  it("aplica el % y el fijo antes del IVA, no después", () => {
    // 2.65% de 100.000 = 2.650 + 700 fijo = 3.350 de comisión → IVA 19% = 636,5 → 636 (redondeado)
    const fee = estimateWompiFeeCop(100_000, DEFAULT_SETTINGS);
    expect(fee).toBe(2_650 + 700 + Math.round((2_650 + 700) * 0.19));
  });

  it("con tarifa en cero, la comisión es cero — no un NaN ni un mínimo oculto", () => {
    const zeroSettings: PaymentFeeSettings = { ...DEFAULT_SETTINGS, wompiPercentageBp: 0, wompiFixedCop: 0, wompiIvaBp: 0 };
    expect(estimateWompiFeeCop(50_000, zeroSettings)).toBe(0);
  });

  it("es proporcional al monto — el doble de venta no menos que el doble de comisión (por el fijo)", () => {
    const feeSmall = estimateWompiFeeCop(10_000, DEFAULT_SETTINGS);
    const feeDouble = estimateWompiFeeCop(20_000, DEFAULT_SETTINGS);
    expect(feeDouble).toBeGreaterThan(feeSmall);
  });
});
