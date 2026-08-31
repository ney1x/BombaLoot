import { z } from "zod";

/**
 * El cliente nunca manda precio, monto ni moneda — solo identifica QUÉ
 * pedido quiere pagar y prueba que es suyo (mismo criterio que el resto del
 * checkout: `accessToken` para invitado, sesión para autenticado).
 */
export const paymentInitSchema = z.object({
  orderId: z.string().uuid(),
  accessToken: z.string().min(16).max(256).optional(),
});
export type PaymentInitBody = z.infer<typeof paymentInitSchema>;

/**
 * La captura de PayPal NO recibe `paypalOrderId` del cliente — se lee de
 * `payment_intents.provider_ref`, guardado ahí durante `init`. Aceptarlo acá
 * dejaría que el cliente eligiera qué orden de PayPal capturar.
 */
export const paypalCaptureSchema = z.object({
  paymentIntentId: z.string().uuid(),
  accessToken: z.string().min(16).max(256).optional(),
});
export type PaypalCaptureBody = z.infer<typeof paypalCaptureSchema>;
