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
  { value: "REFUND_REQUEST", label: "Quiero solicitar un reembolso", orderRequired: true },
  { value: "PAYMENT_PENDING", label: "Mi pago aparece pendiente", orderRequired: true },
  { value: "DELIVERED_NOT_RECEIVED", label: "Mi pedido aparece como completado, pero no lo recibí", orderRequired: true },
  { value: "ACCOUNT_ISSUE", label: "Problemas con mi cuenta", orderRequired: false },
  { value: "OTHER", label: "Reportar un problema", orderRequired: false },
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]["value"];

export const SUPPORT_CATEGORY_LABEL: Record<SupportCategory, string> = Object.fromEntries(
  SUPPORT_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<SupportCategory, string>;

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
