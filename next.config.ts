import type { NextConfig } from "next";

/**
 * `script-src`/`style-src` llevan `'unsafe-inline'` a propósito, no por
 * pereza — justificación (hallazgo de auditoría de seguridad, 2026-09-02):
 * el proyecto no tiene `middleware.ts`, así que no hay forma de generar un
 * nonce por request y pasarlo a los dos usos reales de inline:
 *   1. `<Script id="theme-init" strategy="beforeInteractive">` en
 *      `(storefront)/layout.tsx` — string estático fijado en el código,
 *      nunca interpola nada que venga de un usuario o de la base.
 *   2. Atributos `style={{ ... }}` de React (fondos degradados por juego
 *      en `GameImageSlot`, etc.) — se renderizan como atributo `style`
 *      inline, valores fijos de `GAME_COLORS`, tampoco vienen de input.
 * Ninguno de los dos es un vector real: no hay `dangerouslySetInnerHTML`
 * ni `eval` en todo el proyecto (verificado), así que no existe un punto
 * donde contenido de usuario pueda llegar a convertirse en script/estilo
 * inline. Si en el futuro se agrega `middleware.ts` por otro motivo, vale
 * la pena migrar a nonce y sacar `'unsafe-inline'`.
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // `blob:` — GameVisualsManager/ImagesManager leen ancho/alto real del
  // archivo elegido con `URL.createObjectURL(file)` antes de subirlo (aviso
  // de aspect-ratio equivocado); sin esto el propio navegador bloquea esa
  // lectura por la CSP (verificado en vivo: "Loading the image 'blob:...'
  // violates... img-src"), rompiendo la validación que se agregó para
  // arreglar justo ese problema.
  "img-src 'self' https://*.public.blob.vercel-storage.com blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Nunca anunciar el framework/versión gratis en cada respuesta.
  poweredByHeader: false,
  // Sin esto, next dev bloquea los chunks JS y el HMR cuando se accede
  // por un túnel (ngrok) en vez de localhost — la página carga pero
  // React nunca termina de hidratar, así que los botones no reaccionan.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.io"],
  images: {
    remotePatterns: [
      // Vercel Blob (CDN de /api/admin/upload) — sin esto, next/image
      // rechaza el host con "hostname is not configured" apenas Home
      // intenta renderizar cualquier imagen subida desde el admin.
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  async headers() {
    // Solo en producción: en dev, Turbopack HMR y el túnel de ngrok
    // necesitan libertad (websockets, orígenes dinámicos) que estos
    // headers no vale la pena pelear — ver `allowedDevOrigins` arriba,
    // ese es el control real para dev.
    if (process.env.NODE_ENV !== "production") return [];

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP_DIRECTIVES },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
