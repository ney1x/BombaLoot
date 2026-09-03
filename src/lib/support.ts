/**
 * Compartido entre cliente y servidor: catálogo de motivos de contacto tal
 * como se le muestran al comprador en `/ayuda`, y las etiquetas de estado
 * que reutiliza el panel admin. Sin `server-only` a propósito.
 */

/**
 * `orderRequired`: motivos que no pueden existir sin un pedido de por medio
 * — "no recibiste tu código" o "quiero un reembolso" presuponen una compra
 * real. "Problemas con mi cuenta" o "reportar un problema" no. El número de
 * pedido pasa de sugerido a obligatorio (y se valida contra `orders` al
 * crear el ticket) según esta bandera — un solo lugar, no un `if` repetido
 * en el formulario y en el servicio.
 */
export const SUPPORT_CATEGORIES = [
  { value: "NO_CODE", label: "¿No recibiste tu código?", orderRequired: true },
  { value: "CODE_INVALID", label: "Mi código no funciona", orderRequired: true },
  { value: "ORDER_ISSUE", label: "Tengo un problema con mi pedido", orderRequired: true },
  // Reemplaza a REFUND_REQUEST en esta lista — orderRequired: false a
  // propósito, la premisa del motivo es que la persona NO tiene el
  // número. Se identifica por el email de la compra en su lugar (ver
  // SupportTicketForm, que además pide método de pago y qué compró,
  // los dos opcionales, cuando se elige este motivo).
  { value: "LOST_ORDER_NUMBER", label: "Perdí mi # de pedido y no recibí correo", orderRequired: false },
  { value: "PAYMENT_PENDING", label: "Mi pago aparece pendiente", orderRequired: true },
  { value: "DELIVERED_NOT_RECEIVED", label: "Mi pedido aparece como completado, pero no lo recibí", orderRequired: true },
  { value: "ACCOUNT_ISSUE", label: "Problemas con mi cuenta", orderRequired: false },
  { value: "OTHER", label: "Reportar un problema", orderRequired: false },
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]["value"];

/**
 * Categorías que ya no se pueden elegir al crear un ticket (por eso no
 * están en `SUPPORT_CATEGORIES`) pero que tickets viejos todavía tienen en
 * la base — sin esto, esos tickets mostrarían el valor crudo del enum
 * (`"REFUND_REQUEST"`) en vez de una etiqueta legible.
 */
const LEGACY_CATEGORY_LABEL: Record<string, string> = {
  REFUND_REQUEST: "Quiero solicitar un reembolso",
};

export const SUPPORT_CATEGORY_LABEL: Record<string, string> = {
  ...LEGACY_CATEGORY_LABEL,
  ...Object.fromEntries(SUPPORT_CATEGORIES.map((c) => [c.value, c.label])),
};

export function isOrderRequired(category: string): boolean {
  return SUPPORT_CATEGORIES.some((c) => c.value === category && c.orderRequired);
}

export const SUPPORT_STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En progreso",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

export const SUPPORT_STATUS_TONE: Record<string, "good" | "warn" | "bad" | undefined> = {
  OPEN: "bad",
  IN_PROGRESS: "warn",
  RESOLVED: "good",
  CLOSED: undefined,
};
