/** Estados reales de `payment_intents.status` (payment-intent-service.ts/webhook-service.ts). */
export const STATUS_LABEL: Record<string, string> = {
  PENDING: "PENDIENTE",
  INITIATED: "INICIADO",
  APPROVED: "APROBADO",
  DECLINED: "RECHAZADO",
  FAILED: "FALLIDO",
};

export const STATUS_TONE: Record<string, string | undefined> = {
  PENDING: "warn",
  INITIATED: "warn",
  APPROVED: "good",
  DECLINED: "bad",
  FAILED: "bad",
};
