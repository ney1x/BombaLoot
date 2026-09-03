/** Antes solo en `CodesManager.tsx` — el detalle de pedido también lista códigos por estado, sin traducir ni tono. */
export const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "DISPONIBLE",
  RESERVED: "RESERVADO",
  PAID: "PAGADO",
  DELIVERED: "ENTREGADO",
  VOID: "ANULADO",
};

export const STATUS_TONE: Record<string, string> = {
  AVAILABLE: "good",
  RESERVED: "warn",
  PAID: "accent",
  DELIVERED: "accent",
  VOID: "bad",
};
