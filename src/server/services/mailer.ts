import "server-only";

/**
 * Envío de correo — MOCK. No hay proveedor de email conectado (Resend,
 * SES, lo que sea) en esta fase, igual que Wompi/PayPal siguen sin conectar.
 * En desarrollo, el link de recuperación se imprime en la consola del
 * servidor para poder probar el flujo entero a mano.
 *
 * La forma de la función ya es la definitiva: cuando se conecte un
 * proveedor real, se reemplaza el cuerpo de `sendMail`, no la firma — nada
 * que la llama debería tener que cambiar.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    // Sin proveedor real conectado todavía. No lanzar: que falte el correo
    // no debe tumbar el flujo de recuperación de contraseña en sí (el token
    // ya está creado y es válido igual si el usuario lo consigue por otro
    // canal, ej. soporte). Se deja constancia clara en el log del servidor.
    console.error("[mailer] NODE_ENV=production sin proveedor de email configurado.", {
      to: message.to,
      subject: message.subject,
    });
    return;
  }

  console.log(
    [
      "\n───────────────────────────────────────────",
      `[mailer:mock] Para: ${message.to}`,
      `[mailer:mock] Asunto: ${message.subject}`,
      "",
      message.text,
      "───────────────────────────────────────────\n",
    ].join("\n"),
  );
}

export function passwordResetEmail(resetUrl: string): MailMessage["text"] {
  return [
    "Pediste restablecer tu contraseña en Loadout.",
    "",
    `Abrí este link para elegir una nueva (vence en 30 minutos): ${resetUrl}`,
    "",
    "Si no fuiste vos, ignorá este correo — tu contraseña actual sigue funcionando.",
  ].join("\n");
}

/**
 * Copy aprobado explícitamente para el caso "pago confirmado, código no
 * disponible" (Fase 5). Nunca decir que el pago falló — falló la entrega,
 * no el cobro, y el cliente no debería dudar de que el dinero llegó.
 */
export function paymentUnavailableEmail(orderNumber: string): string {
  return [
    "Recibimos correctamente tu pago, pero no pudimos entregar el código " +
      "solicitado debido a un problema de disponibilidad.",
    "",
    `Tu pedido #${orderNumber} ha sido marcado para reembolso. Te notificaremos ` +
      "cuando el proceso haya sido completado.",
  ].join("\n");
}

/** Mismo caso que arriba, pero cuando el reembolso automático no aplica (Wompi post-captura). */
export function paymentManualReviewEmail(orderNumber: string): string {
  return [
    "Recibimos correctamente tu pago, pero no pudimos entregar el código solicitado.",
    "",
    `Tu caso (pedido #${orderNumber}) ha sido enviado a revisión para gestionar ` +
      "el reembolso. Te notificaremos cuando el proceso haya sido completado.",
  ].join("\n");
}

export function refundCompletedEmail(orderNumber: string): string {
  return [
    `El reembolso de tu pedido #${orderNumber} fue procesado correctamente.`,
    "",
    "Según tu método de pago, puede tardar unos días hábiles en reflejarse.",
  ].join("\n");
}
