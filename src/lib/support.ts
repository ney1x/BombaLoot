/**
 * Compartido entre cliente y servidor: catálogo de motivos de contacto tal
 * como se le muestran al comprador en `/ayuda`, y las etiquetas de estado
 * que reutiliza el panel admin. Sin `server-only` a propósito.
 */

export const SUPPORT_CATEGORIES = [
  { value: "NO_CODE", label: "¿No recibiste tu código?" },
  { value: "CODE_INVALID", label: "Mi código no funciona" },
  { value: "ORDER_ISSUE", label: "Tengo un problema con mi pedido" },
  { value: "REFUND_REQUEST", label: "Quiero solicitar un reembolso" },
  { value: "PAYMENT_PENDING", label: "Mi pago aparece pendiente" },
  { value: "DELIVERED_NOT_RECEIVED", label: "Mi pedido aparece como completado, pero no lo recibí" },
  { value: "ACCOUNT_ISSUE", label: "Problemas con mi cuenta" },
  { value: "OTHER", label: "Reportar un problema" },
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]["value"];

export const SUPPORT_CATEGORY_LABEL: Record<SupportCategory, string> = Object.fromEntries(
  SUPPORT_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<SupportCategory, string>;

export const SUPPORT_STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En progreso",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

export const SUPPORT_STATUS_TONE: Record<string, "good" | "warn" | "bad" | undefined> = {
  OPEN: "warn",
  IN_PROGRESS: "warn",
  RESOLVED: "good",
  CLOSED: undefined,
};
