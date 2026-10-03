/**
 * Antes vivían solo en `pedidos/page.tsx` — la página de detalle
 * (`pedidos/[id]/page.tsx`) mostraba el enum crudo en un badge sin tono,
 * perdiendo justo la señal de severidad que la lista sí construye. Un solo
 * lugar de ahora en más, para que no puedan volver a divergir.
 */
export const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "PENDIENTE",
  PAID_PENDING_DELIVERY: "PAGADO",
  PAID_AWAITING_REFUND: "ESPERA REEMBOLSO",
  COMPLETED: "COMPLETADO",
  REFUNDED: "REEMBOLSADO",
  PAYMENT_EXPIRED: "PAGO VENCIDO",
  FAILED: "FALLIDO",
};

export const STATUS_TONE: Record<string, string | undefined> = {
  PENDING_PAYMENT: "warn",
  PAID_PENDING_DELIVERY: "good",
  PAID_AWAITING_REFUND: "bad",
  COMPLETED: "good",
  // Antes sin tono — caía en el mismo gris plano de un placeholder sin
  // estilo, para un estado terminal financieramente significativo (ya se
  // devolvió la plata). `accent` ya existe en el sistema de tonos y no se
  // usaba en ningún lado de este mapa.
  REFUNDED: "accent",
  PAYMENT_EXPIRED: "bad",
  FAILED: "bad",
};
