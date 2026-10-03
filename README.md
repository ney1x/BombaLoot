# BombaLoot

Tienda en línea de códigos digitales y recargas para videojuegos (Valorant, Roblox, League of Legends, Overwatch) en Colombia. El cliente paga y recibe su código **automáticamente** apenas se confirma el pago, sin necesidad de crear cuenta.

🔗 **En vivo:** [bombaloot.vercel.app](https://bombaloot.vercel.app) — pagos reales en producción con Wompi y PayPal.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · PostgreSQL (Neon) · Drizzle ORM · Zod · Wompi · PayPal · Resend · Vercel · Vitest

---

## Funcionalidades

### Tienda
- Catálogo por juego y denominación, carrito y **checkout como invitado** (sin registro obligatorio).
- **Pagos en COP con Wompi** (checkout de Wompi y Nequi con notificación push) y **en USD con PayPal**.
- **Entrega automática** del código al confirmarse el pago, por pantalla y por correo.
- Precio estimado en la **moneda local del visitante**, según su país (el cobro siempre es en COP).
- Cuentas de usuario con login por correo o **Google OAuth**, historial de pedidos y **programa de fidelización** con cupones.
- **Soporte con tickets** y conversación en tiempo real con el equipo.
- SEO técnico: sitemap, robots y datos estructurados (JSON-LD).

### Panel de administración
- Dashboard de ventas, pedidos, pagos y reembolsos.
- Gestión de productos, inventario de códigos, imágenes, descuentos y niveles de fidelización.
- Roles (`SUPERADMIN`, `ADMIN`, `SUPPORT`) con invitaciones por correo.
- Seguridad: bloqueo de IPs, suspensión de cuentas y **registro de auditoría** de cada acción administrativa.

## Decisiones técnicas destacadas

- **Inventario sin sobreventa:** los códigos se *reservan* por un tiempo limitado al iniciar el checkout. Un barrido periódico libera las reservas vencidas.
- **Códigos cifrados en reposo** con AES-256-GCM, más una huella HMAC-SHA256 para detectar duplicados sin poder descifrarlos.
- **Códigos vendidos inmutables:** un *trigger* de PostgreSQL rechaza cualquier `DELETE` sobre un código ya pagado o entregado, incluso desde la base de datos.
- **Webhooks verificados:** las notificaciones de Wompi y PayPal se validan con su firma, y la transacción se vuelve a consultar en la API del proveedor antes de entregar nada.
- **Conciliación y reembolsos en segundo plano:** cron jobs protegidos por secreto sincronizan pagos atascados y procesan reembolsos.
- **Accesos por cookie `httpOnly`** en lugar de tokens en la URL, para pedidos y tickets de invitados.
- **Rate limiting** en login, checkout y soporte.
- **Auditoría de seguridad** propia: 15 hallazgos identificados y corregidos, con tests de regresión.

## Arquitectura

```
src/
├── app/
│   ├── (storefront)/   Tienda pública: catálogo, carrito, checkout, cuenta, soporte
│   ├── admin/          Panel de administración
│   └── api/            API: auth, checkout, pagos, webhooks, cron, admin
├── components/         Componentes de UI (CSS Modules)
├── lib/                Lógica del cliente (carrito, sesión, moneda, SEO)
└── server/
    ├── auth/           Sesiones, guards por rol, Google OAuth
    ├── crypto/         Cifrado de códigos
    ├── db/             Esquema Drizzle y migraciones SQL
    └── services/       Lógica de negocio: inventario, checkout, pagos, soporte
tests/                  Tests con Vitest (incluye invariantes de inventario)
```

## Ejecutar en local

Requisitos: Node.js 20+ y Docker.

```bash
npm install
cp .env.example .env.local   # completar las variables (ver comentarios en el archivo)
npm run db:up                # levanta PostgreSQL con Docker
npm run db:migrate
npm run db:seed
npm run dev                  # http://localhost:3000
```

Tests:

```bash
npm test
```

## Autor

**Ney Salazar** — [@ney1x](https://github.com/ney1x). Diseño, desarrollo y despliegue del proyecto completo.
