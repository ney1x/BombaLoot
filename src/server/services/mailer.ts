import "server-only";

import { Resend } from "resend";

/**
 * Envío de correo. Con `RESEND_API_KEY` configurada, manda de verdad vía
 * Resend; sin ella, cae al mismo mock de siempre (imprime en consola) —
 * así un ambiente sin la key configurada (local, o antes de que se
 * termine de dar de alta el dominio) sigue funcionando para probar el
 * resto del flujo sin que falte el correo tumbe nada.
 *
 * La forma de la función es la misma de siempre: nada que la llama tuvo
 * que cambiar cuando se conectó el proveedor real.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

let resendClient: Resend | undefined;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const client = getResendClient();

  if (!client) {
    if (process.env.NODE_ENV === "production") {
      // Sin proveedor real conectado todavía. No lanzar: que falte el correo
      // no debe tumbar el flujo que lo dispara (el token de reset ya está
      // creado y es válido igual, el código ya se le mostró en pantalla,
      // etc.). Se deja constancia clara en el log del servidor.
      console.error("[mailer] NODE_ENV=production sin RESEND_API_KEY configurada.", {
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
    return;
  }

  const from = process.env.EMAIL_FROM || "BombaLoot <onboarding@resend.dev>";
  const { error } = await client.emails.send({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });

  // Mismo criterio que la rama sin proveedor: un email que no salió no
  // debe tumbar el flujo que lo disparó — el pedido ya está pagado y
  // entregado en pantalla, el reset ya tiene su token válido. Se deja
  // constancia en el log para poder reenviarlo a mano si hace falta.
  if (error) {
    console.error("[mailer] Resend rechazó el envío.", { to: message.to, subject: message.subject, error });
  }
}

export function passwordResetEmail(resetUrl: string): MailMessage["text"] {
  return [
    "Pediste restablecer tu contraseña en BombaLoot.",
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

interface DeliveredCodeForEmail {
  gameLabel: string;
  denomination: string;
  unit: string;
  code: string;
}

/**
 * Respaldo del código por email — la fuente de verdad sigue siendo
 * `/pedido/[id]`, esto es para cuando el comprador no guardó ese link.
 * Nunca se manda antes de que el código ya esté `DELIVERED` en la base
 * (ver `deliverOrderCodes`), así que lo que viaja acá ya se le mostró en
 * pantalla — no es la primera vez que ve el valor en claro.
 */
export function codesDeliveredEmail(orderNumber: string, codes: DeliveredCodeForEmail[]): string {
  const lines = codes.map((c) => `${c.gameLabel} · ${c.denomination} ${c.unit}: ${c.code}`);
  return [
    `Tu pedido #${orderNumber} ya está confirmado. Estos son tus códigos:`,
    "",
    ...lines,
    "",
    "Guardalos en un lugar seguro — cada uno es de un solo uso y no los compartas con nadie.",
    "",
    "Podés volver a verlos cuando quieras en tu pedido, en BombaLoot.",
  ].join("\n");
}
