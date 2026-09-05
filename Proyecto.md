# BombaLoot — Estado del proyecto

Última actualización: 2026-09-05

Tienda de recargas y códigos digitales (Valorant, Roblox, League of Legends, Overwatch) para Colombia. Guest checkout, entrega automática de códigos apenas se confirma el pago, panel admin propio.

**Stack:** Next.js 16 (App Router, Turbopack) · PostgreSQL (Neon) · Wompi (COP) + PayPal (USD) · Vercel · Resend (email).

**Estado del sitio:** en vivo en `https://bombaloot.vercel.app` (Wompi y PayPal en modo **producción real**, ya se hizo una compra real de prueba). Dominio propio (`bombaloot.com`) todavía no comprado — ver pendientes al final.

---

## 1. Deploy y dominio

- **Proyecto Vercel:** `bombaloot` (cuenta `ney15alejo-6297`), vinculado con `.vercel/project.json`.
- **Repo GitHub:** `github.com/ney1x/BombaLoot` — **⚠️ los cambios de esta sesión NO están commiteados todavía**, solo desplegados vía `vercel --prod` (sube el filesystem local directo, sin pasar por git). Si se hace `git push` con el estado viejo, pisaría lo que está en producción.
- **URL pública actual:** `https://bombaloot.vercel.app` (alias gratis del proyecto, sin costo — no confundir con comprar un dominio en el marketplace de Vercel).
- **Dominio decidido:** `bombaloot.com` (no `.co`) — más barato y más confiable para checkout:
  - `.com`: ~$11 el primer año, **$14,98/año de renovación** (el más barato a largo plazo junto con `.net`).
  - `.co`: renovación real ~$38/año — descartado.
  - `.com.co`: ~$26/año renovación — descartado.
  - Comprar en **Namecheap** (no Vercel — Vercel cobra ~$20 de más por registrar dominios). Al comprar: **destildar "Web Hosting"** (Vercel ya hostea) y dejar "Business Email" solo si de verdad se va a usar un buzón `@bombaloot.com`.
  - **Pendiente:** comprar el dominio, conectarlo a Vercel, y volver a apuntar las 3 URLs de cron + `APP_URL` una sola vez más.

### Deploy pausado (resuelto)

El proyecto se pausó solo en Vercel (`DEPLOYMENT_PAUSED`, protección de uso en plan Hobby) — se reactivó manualmente desde el dashboard de Vercel. Si vuelve a pasar, revisar Usage/Billing de la cuenta.

---

## 2. Variables de entorno (Vercel → Production)

Todas cargadas y confirmadas. Las de pago están en modo **Config** (visibles, no "Secret" — decisión explícita para poder editarlas fácil; solo importa si en algún momento se suma otra persona al equipo de Vercel).

| Variable | Estado |
|---|---|
| `DATABASE_URL` + resto de vars `POSTGRES_*`/`PG*`/`NEON_*` | Auto (integración Neon) |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY` | Auto (integración Vercel Blob) |
| `CODE_ENCRYPTION_KEY`, `CODE_FINGERPRINT_KEY` | ✅ cargadas — **críticas**, sin esto el sitio no puede tocar códigos |
| `APP_URL` | `https://bombaloot.vercel.app` — cambiar cuando se conecte el dominio propio |
| `RESEND_API_KEY` | ✅ cargada. `EMAIL_FROM` vacío → cae al remitente sandbox (`onboarding@resend.dev`) |
| `WOMPI_API_URL` | `https://production.wompi.co/v1` (producción real) |
| `WOMPI_PUBLIC_KEY` / `WOMPI_PRIVATE_KEY` | `pub_prod_...` / `prv_prod_...` (producción real) |
| `WOMPI_INTEGRITY_SECRET` / `WOMPI_EVENTS_SECRET` | Producción real |
| `PAYPAL_API_URL` | `https://api-m.paypal.com` (Live, no sandbox) |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Live |
| `PAYPAL_WEBHOOK_ID` | Live — configurado en developer.paypal.com, app Live, con estos 5 eventos suscriptos: `PAYMENT.CAPTURE.COMPLETED`, `CHECKOUT.ORDER.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `CHECKOUT.ORDER.VOIDED`, `PAYMENT.CAPTURE.REFUNDED` |
| `USD_COP_EXCHANGE_RATE` | Tasa fija manual (no hay proveedor en vivo conectado) |
| `CRON_SECRET` | ✅ protege `/api/cron/*` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Login con Google — **⚠️ el Authorized redirect URI en Google Cloud Console debe incluir `https://bombaloot.vercel.app/api/auth/google/callback`** (se agregó tras el cambio de `APP_URL`) |

`.env.local` (dev) tiene los mismos nombres con las mismas claves reales — cuidado si se comparte ese archivo, nunca se sube a git (`.gitignore` ya excluye `.env*`).

---

## 3. Pagos

### Wompi

- Webhook: `https://bombaloot.vercel.app/api/webhooks/wompi` — cargado en el dashboard de Wompi en modo **producción** (dashboard separado del de sandbox).
- El webhook re-consulta la transacción a la API de Wompi por `id` (no confía en el body del POST) — hallazgo de la auditoría de seguridad: la firma de Wompi no cubre `transaction.reference`.
- **Nequi vía Wompi**: el nombre que ve el cliente en la notificación push ("Venta de código" en vez de "BombaLoot") **no lo controla el código** — es el nombre comercial registrado en la cuenta de Wompi. Cambiarlo ahí, no acá.
- **Comisión real medida**: pago de prueba $1.500 COP → ~$600 neto. Confirma la fórmula del Plan Avanzado de Wompi: **2,65% + $700 COP + IVA 19% sobre la comisión**.

### PayPal

- App Live creada, credenciales cargadas.
- Webhook configurado en developer.paypal.com (ver eventos arriba).
- La comisión de PayPal se lee **exacta** de su propia respuesta (`seller_receivable_breakdown.paypal_fee`) — no es estimada.

### ¿Se puede sacar Nequi de encima de Wompi? (investigado, sin resolver)

- Nequi **no tiene** una API de comercio propia e independiente para cobros de e-commerce — "Nequi Negocios" (el producto oficial) funciona **en alianza con Wompi** por debajo.
- Existe una API 100% directa de Nequi ("Pagos con notificación Push" / Pago con QR, vía `developer.nequi.com.co`, sin mencionar a Wompi) que sí replicaría el flujo actual (push a la app, con webhook).
- **Elegibilidad confirmada:** persona natural califica (cédula + RUT si aplica + cuenta Nequi/certificación Bancolombia) — no hace falta constituir empresa. Aprobación: ~1 día hábil respuesta inicial, ~3 días hábiles decisión final.
- **La comisión real no está pública** — hay que preguntarla durante el trámite de vinculación.
- **Estado:** se envió el formulario de interés en [nequi.com.co/negocios/vinculacion](https://www.nequi.com.co/negocios/vinculacion) marcando "Botón Nequi" + "Tienda virtual". **Esperando respuesta de Nequi.** No se escribió ninguna línea de código para esto todavía — depende 100% de la tarifa real que ofrezcan.
- Se investigó también qué usa el competidor **Bonoxs**: su checkout pega a su propio backend (`api.bonoxs.com`), igual que el nuestro — el proveedor de pago real que usan es invisible desde afuera, por diseño. Su flujo de Nequi dice "Flujo Mejorado" (redirección, no push), compatible con estar también sobre Wompi u otro agregador.

### Panel de comisiones (nuevo, `/admin` Dashboard)

- Tabla "Ventas por admin": ahora con **bruto y neto** (mes y total), prorrateando la comisión del pedido entre los admins si el pedido mezcla códigos de más de uno.
- Nueva sección "Ventas por método de pago": transacciones, bruto, comisión y neto por Wompi/PayPal, con etiqueta "estimado" cuando corresponde.
- Tarifa de Wompi editable desde el panel (solo SUPERADMIN) — `payment_fee_settings` (singleton), default = Plan Avanzado (2,65% + $700 + IVA 19%).
- Migración `0026_payment_fees.sql`: agrega `payment_fee_settings` y columnas `fee_cop`/`fee_usd`/`fee_is_estimated` a `payment_intents`.

---

## 4. Cron jobs (cron-job.org)

Tres jobs, protegidos por `CRON_SECRET` (header `Authorization: Bearer <secreto>`):

| Job | Endpoint | Frecuencia |
|---|---|---|
| `sweep` | `/api/cron/sweep` | 1-2 min |
| `refund-worker` | `/api/cron/refund-worker` | 1-2 min |
| `reconcile-payments` | `/api/cron/reconcile-payments` | 5 min |

**⚠️ Corregir apenas se compre el dominio:** las 3 URLs quedaron apuntando a `https://bombaloot.co/...` (dominio nunca comprado → fallan por DNS). Cambiar a `https://bombaloot.vercel.app/api/cron/...` mientras tanto, y reactivar los que cron-job.org pausó solo por fallos repetidos (`refund-worker` y `sweep` quedaron "Inactivo").

`reconcile-payments` es el seguro real contra webhooks perdidos: si un `payment_intent` queda "INITIATED" más de 5 minutos, este cron le pregunta directo a Wompi/PayPal el estado real (usando las claves privadas, no el secreto del webhook) y entrega el código igual si el pago sí se aprobó. El único escenario donde un pago se pierde de verdad es que el secreto del webhook Y la clave privada estén mal configuradas al mismo tiempo.

---

## 5. Seguridad — auditoría completa (15 hallazgos, todos resueltos)

**Altos (2):**
1. XSS almacenado vía JSON-LD sin escapar — `lib/seo.ts` ahora escapa `<`, `>`, `&` en los 8 lugares donde se inyecta `dangerouslySetInnerHTML` (producto, breadcrumb, FAQ, organización, sitio).
2. Denegación de inventario por cron mal configurado — resuelto ajustando la cadencia real de `sweep`/`refund-worker`/`reconcile-payments` (ver sección 4).

**Medios (5) y Bajos/Informativos (8)** — entre los más relevantes:
- `timingSafeStringEqual` en `cron-auth.ts` reescrito con hash SHA-256 + `timingSafeEqual` real (antes comparaba largos distintos de forma insegura).
- Migración `0024_codes_delete_immutable.sql`: trigger que **rechaza cualquier DELETE** sobre un código ya `PAID`/`DELIVERED` — ni un SUPERADMIN puede borrar un código vendido directo en la base.
- **Token de acceso a pedidos por URL → cookie httpOnly**: rediseño completo. Antes el link de recuperación de pedido (`?token=...`) viajaba en la URL (queda en logs, historial, Referer). Ahora se planta como cookie httpOnly `loadout_order_<id>` (90 días) apenas se crea el pedido o se usa el link de recuperación; el query param se acepta solo como respaldo temporal. Mismo patrón aplicado a los tickets de soporte (`loadout_ticket_<id>`).
- `updateTicketAdmin` ahora valida que `assignedTo` sea de verdad un ADMIN/SUPPORT/SUPERADMIN antes de asignar (antes aceptaba cualquier UUID), y audita cada cambio de estado/asignación.
- Auditoría de `support.ticket_updated` agregada a `AuditAction`.

Todo verificado con tests (incluye tests de regresión de seguridad específicos, ej. "un `</script>` en denomination/unit no rompe el script real").

---

## 6. Otras funcionalidades agregadas esta sesión

- **Precio estimado en moneda local**: detecta el país por `x-vercel-ip-country` (gratis en Vercel, se apaga solo fuera de Vercel) y convierte con `open.er-api.com` (gratis, sin key, cacheado 12h). Muestra "≈ $86 MXN" debajo del precio en COP, en ficha de producto, catálogo y home — siempre aclarando que el cobro real es en COP. Corregido un bug real: varias monedas (MXN, ARS) comparten el símbolo "$" con COP, así que siempre se agrega el código ISO para no confundir.
- **Imagen de catálogo por juego (fallback)**: nuevo placement `"catalog"` en `game_visuals` (migración `0025`) — si una denominación no tiene imagen propia, cae al banner general del juego en vez del placeholder genérico. Editable desde `/admin/juegos`.
- **Bug de Nequi + polling arreglado**: la pantalla de "esperando confirmación en Nequi" cortaba el polling a los 60 segundos, pero Nequi da hasta 9 minutos para aprobar — quedaba congelada. Ahora la ventana real es de 9 minutos (cada 3s el primer minuto, cada 15s después) y agrega un estado "Todavía no confirmamos tu pago — Volver a consultar" en vez de quedar muda.
- **Emails con diseño propio**: los 6 correos (código entregado, reset de contraseña, invitación admin, pago sin entrega, revisión manual, reembolso) pasaron de texto plano a HTML con logo BombaLoot y colores de marca (manteniendo `text` como respaldo). **Pendiente:** el remitente sigue en modo sandbox de Resend — solo llega a la propia cuenta, no a clientes reales, hasta verificar un dominio.
- **Tema oscuro por defecto**: un visitante nuevo (sin preferencia guardada) ahora entra en modo oscuro; quien ya eligió explícitamente sigue respetándose. Solo en el storefront público, no en `/admin`.
- Limpieza de datos de prueba: se vació la base de pedidos/códigos/pagos de testing (manteniendo catálogo y usuarios), dejando `ney15alejo@gmail.com` como único SUPERADMIN.
- Varios ajustes de diseño menores (breadcrumb, espaciados, acordeón de FAQ, colores de Roblox/League, indicador de navegación lenta).

---

## 7. Pendientes (en orden sugerido)

1. **Comprar `bombaloot.com`** en Namecheap (destildar hosting/email extra).
2. Conectar el dominio a Vercel, actualizar `APP_URL`.
3. Verificar el dominio en **Resend** (agrega registros DNS) → habilita mandar correo a clientes reales, no solo a la cuenta propia.
4. Reapuntar las 3 URLs de cron-job.org al dominio nuevo.
5. Esperar respuesta de Nequi sobre la API directa — decidir si vale la pena migrar según la tarifa real que ofrezcan.
6. **`git add` + commit** de todo lo de esta sesión (16 archivos, ver `git status`) — hoy solo está desplegado en Vercel, no en GitHub.
7. Subir códigos reales de inventario (la base quedó vacía tras la limpieza de prueba).
