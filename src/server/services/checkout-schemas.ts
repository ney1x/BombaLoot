import { z } from "zod";

/**
 * Límite duro de cantidad por línea, independiente del `max_per_order` de
 * cada producto (que se valida después, contra la base). Esto es la
 * primera barrera — rechaza "cantidades absurdamente grandes" antes de que
 * la request llegue a tocar una fila.
 */
const MAX_QUANTITY_PER_LINE = 50;
const MAX_LINES_PER_CHECKOUT = 20;

export const checkoutLineSchema = z.object({
  productId: z.string().trim().min(1).max(64),
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
});

export const checkoutSchema = z.object({
  lines: z.array(checkoutLineSchema).min(1, "El carrito está vacío").max(MAX_LINES_PER_CHECKOUT),
  /**
   * UUID que el cliente genera una vez por intento de checkout (al entrar a
   * /checkout) y reenvía en cada reintento del MISMO intento — doble clic,
   * refresh, retry de red. Un intento nuevo (el usuario vuelve más tarde,
   * cambia el carrito) genera una clave nueva.
   */
  idempotencyKey: z.string().uuid("idempotencyKey debe ser un UUID"),
  /** Solo se usa si no hay sesión — para un usuario logueado, el email sale de la cuenta. */
  buyerEmail: z.string().trim().toLowerCase().email().max(320).optional(),
  buyerName: z.string().trim().max(120).optional(),
  /** Código de cupón opcional, tal como lo escribió el comprador. */
  discountCode: z.string().trim().min(1).max(40).optional(),
});

export type CheckoutRequestBody = z.infer<typeof checkoutSchema>;
