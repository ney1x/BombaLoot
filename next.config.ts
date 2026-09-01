import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
