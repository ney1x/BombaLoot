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
  /** Versión HTML — opcional a propósito: `sendMail` sigue funcionando con solo `text` (ver `adminInviteEmail`/`passwordResetEmail`, sin rediseñar todavía). */
  html?: string;
}

/**
 * Nada de `<style>` ni clases — Gmail (webmail, que es donde vive la
 * mayoría de los clientes reales de esta tienda) recorta `<head>` y
 * bloques `<style>` bastante agresivo; todo lo que tiene que sobrevivir
 * viaja como estilo inline. Un layout de una sola columna, sin tablas,
 * ya renderiza bien ahí — no hace falta la tabla-sopa clásica de Outlook
 * de escritorio, que no es el target acá.
 */
const BRAND = {
  bg: "#101216",
  card: "#171a20",
  border: "#2b2f38",
  ink: "#ece9e1",
  inkSoft: "#a3a8b4",
  accent: "#f2a53d",
  accentDeep: "#c2410c",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Envoltorio común — logo + card + pie de página. `bodyHtml` ya viene armado (párrafos, no texto plano) por cada builder de abajo. */
function emailShell(bodyHtml: string): string {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:32px 16px;background:${BRAND.bg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
      <tr>
        <td style="padding-bottom:24px;text-align:center;">
          <span style="font-size:22px;font-weight:800;color:${BRAND.ink};letter-spacing:-0.01em;">
            Bomba<span style="color:${BRAND.accent};">Loot</span>
          </span>
        </td>
      </tr>
      <tr>
        <td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;padding:28px 24px;">
          <div style="color:${BRAND.ink};font-size:15px;line-height:1.6;">${bodyHtml}</div>
        </td>
      </tr>
      <tr>
        <td style="padding-top:20px;text-align:center;color:${BRAND.inkSoft};font-size:12px;">
          BombaLoot · recargas y códigos digitales
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function emailButton(url: string, label: string): string {
  return `<p style="margin:20px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;background:${BRAND.accentDeep};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">${escapeHtml(label)}</a></p>`;
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
    ...(message.html ? { html: message.html } : {}),
  });

  // Mismo criterio que la rama sin proveedor: un email que no salió no
  // debe tumbar el flujo que lo disparó — el pedido ya está pagado y
  // entregado en pantalla, el reset ya tiene su token válido. Se deja
  // constancia en el log para poder reenviarlo a mano si hace falta.
  if (error) {
    console.error("[mailer] Resend rechazó el envío.", { to: message.to, subject: message.subject, error });
  }
}

interface EmailContent {
  text: string;
  html: string;
}

/** Invitación a ADMIN — vence en 7 días, aceptar exige estar logueado con este mismo email. */
export function adminInviteEmail(acceptUrl: string): EmailContent {
  const text = [
    "Te invitaron a administrar BombaLoot.",
    "",
    `Iniciá sesión (o creá una cuenta) con este mismo email y abrí este link para aceptar (vence en 7 días): ${acceptUrl}`,
    "",
    "Si no esperabas esta invitación, podés ignorar este correo — no pasa nada hasta que se acepte.",
  ].join("\n");
  const html = emailShell(
    [
      `<p>Te invitaron a administrar <strong>BombaLoot</strong>.</p>`,
      `<p>Iniciá sesión (o creá una cuenta) con este mismo email para aceptar. El link vence en 7 días.</p>`,
      emailButton(acceptUrl, "Aceptar invitación"),
      `<p style="color:${BRAND.inkSoft};font-size:13px;">Si no esperabas esta invitación, podés ignorar este correo — no pasa nada hasta que se acepte.</p>`,
    ].join(""),
  );
  return { text, html };
}

export function passwordResetEmail(resetUrl: string): EmailContent {
  const text = [
    "Pediste restablecer tu contraseña en BombaLoot.",
    "",
    `Abrí este link para elegir una nueva (vence en 30 minutos): ${resetUrl}`,
    "",
    "Si no fuiste vos, ignorá este correo — tu contraseña actual sigue funcionando.",
  ].join("\n");
  const html = emailShell(
    [
      `<p>Pediste restablecer tu contraseña en <strong>BombaLoot</strong>.</p>`,
      `<p>Este link vence en 30 minutos.</p>`,
      emailButton(resetUrl, "Elegir nueva contraseña"),
      `<p style="color:${BRAND.inkSoft};font-size:13px;">Si no fuiste vos, ignorá este correo — tu contraseña actual sigue funcionando.</p>`,
    ].join(""),
  );
  return { text, html };
}

/**
 * Copy aprobado explícitamente para el caso "pago confirmado, código no
 * disponible" (Fase 5). Nunca decir que el pago falló — falló la entrega,
 * no el cobro, y el cliente no debería dudar de que el dinero llegó.
 */
export function paymentUnavailableEmail(orderNumber: string): EmailContent {
  const safeOrderNumber = escapeHtml(orderNumber);
  const text = [
    "Recibimos correctamente tu pago, pero no pudimos entregar el código " +
      "solicitado debido a un problema de disponibilidad.",
    "",
    `Tu pedido #${orderNumber} ha sido marcado para reembolso. Te notificaremos ` +
      "cuando el proceso haya sido completado.",
  ].join("\n");
  const html = emailShell(
    [
      `<p>Recibimos correctamente tu pago, pero no pudimos entregar el código solicitado debido a un problema de disponibilidad.</p>`,
      `<p>Tu pedido <strong>#${safeOrderNumber}</strong> fue marcado para reembolso. Te notificaremos cuando el proceso haya sido completado.</p>`,
    ].join(""),
  );
  return { text, html };
}

/** Mismo caso que arriba, pero cuando el reembolso automático no aplica (Wompi post-captura). */
export function paymentManualReviewEmail(orderNumber: string): EmailContent {
  const safeOrderNumber = escapeHtml(orderNumber);
  const text = [
    "Recibimos correctamente tu pago, pero no pudimos entregar el código solicitado.",
    "",
    `Tu caso (pedido #${orderNumber}) ha sido enviado a revisión para gestionar ` +
      "el reembolso. Te notificaremos cuando el proceso haya sido completado.",
  ].join("\n");
  const html = emailShell(
    [
      `<p>Recibimos correctamente tu pago, pero no pudimos entregar el código solicitado.</p>`,
      `<p>Tu caso (pedido <strong>#${safeOrderNumber}</strong>) fue enviado a revisión para gestionar el reembolso. Te notificaremos cuando el proceso haya sido completado.</p>`,
    ].join(""),
  );
  return { text, html };
}

export function refundCompletedEmail(orderNumber: string): EmailContent {
  const safeOrderNumber = escapeHtml(orderNumber);
  const text = [
    `El reembolso de tu pedido #${orderNumber} fue procesado correctamente.`,
    "",
    "Según tu método de pago, puede tardar unos días hábiles en reflejarse.",
  ].join("\n");
  const html = emailShell(
    [
      `<p>El reembolso de tu pedido <strong>#${safeOrderNumber}</strong> fue procesado correctamente.</p>`,
      `<p style="color:${BRAND.inkSoft};font-size:13px;">Según tu método de pago, puede tardar unos días hábiles en reflejarse.</p>`,
    ].join(""),
  );
  return { text, html };
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
export function codesDeliveredEmail(orderNumber: string, codes: DeliveredCodeForEmail[]): EmailContent {
  const lines = codes.map((c) => `${c.gameLabel} · ${c.denomination} ${c.unit}: ${c.code}`);
  const text = [
    `Tu pedido #${orderNumber} ya está confirmado. Estos son tus códigos:`,
    "",
    ...lines,
    "",
    "Guardalos en un lugar seguro — cada uno es de un solo uso y no los compartas con nadie.",
    "",
    "Podés volver a verlos cuando quieras en tu pedido, en BombaLoot.",
  ].join("\n");

  const codeRows = codes
    .map(
      (c) => `
      <div style="margin-bottom:10px;padding:14px 16px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:10px;">
        <div style="color:${BRAND.inkSoft};font-size:12px;margin-bottom:4px;">${escapeHtml(c.gameLabel)} · ${escapeHtml(c.denomination)} ${escapeHtml(c.unit)}</div>
        <div style="font-family:'SFMono-Regular',Consolas,monospace;font-size:16px;font-weight:700;color:${BRAND.accent};letter-spacing:0.02em;">${escapeHtml(c.code)}</div>
      </div>`,
    )
    .join("");

  const html = emailShell(
    [
      `<p>Tu pedido <strong>#${escapeHtml(orderNumber)}</strong> ya está confirmado. Estos son tus códigos:</p>`,
      codeRows,
      `<p style="color:${BRAND.inkSoft};font-size:13px;">Guardalos en un lugar seguro — cada uno es de un solo uso y no los compartas con nadie.</p>`,
      `<p style="color:${BRAND.inkSoft};font-size:13px;">Podés volver a verlos cuando quieras en tu pedido, en BombaLoot.</p>`,
    ].join(""),
  );
  return { text, html };
}
