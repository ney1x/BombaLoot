import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
