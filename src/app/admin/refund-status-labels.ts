/** Antes solo en `reembolsos/page.tsx` — el detalle de pedido también muestra estos estados, sin traducir. */
export const STATUS_LABEL: Record<string, string> = {
  PENDING_REFUND: "PENDIENTE",
  REFUND_INITIATED: "INICIADO",
  REFUND_COMPLETED: "COMPLETADO",
  REFUND_FAILED: "FALLIDO",
  MANUAL_REVIEW_REQUIRED: "REVISIÓN MANUAL",
  CANCELLED: "CANCELADO",
};

export const STATUS_TONE: Record<string, string | undefined> = {
  PENDING_REFUND: "warn",
  REFUND_INITIATED: "warn",
  REFUND_COMPLETED: "good",
  REFUND_FAILED: "bad",
  MANUAL_REVIEW_REQUIRED: "bad",
  CANCELLED: undefined,
};
