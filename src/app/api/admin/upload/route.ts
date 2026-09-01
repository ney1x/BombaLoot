import { put } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/server/auth/guards";
import { apiErrorToResponse } from "@/server/http/respond";

/**
 * Upload genérico de imágenes del admin (banners de juego, imágenes de
 * producto) a Vercel Blob — CDN real en vez de pegar una URL o una ruta
 * local a mano (ver comentario de cabecera en admin-images.ts). Un solo
 * endpoint reusado por cualquier manager del admin que necesite subir un
 * archivo: recibe multipart/form-data con un campo `file`, devuelve la URL
 * pública ya en el CDN.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — de sobra para banners/fotos de producto
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminApi();

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        {
          error:
            "Storage no configurado: falta BLOB_READ_WRITE_TOKEN. Activá Vercel Blob en el proyecto y agregá el token a .env.local.",
        },
        { status: 503 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Formato no soportado — usá PNG, JPG, WEBP o AVIF." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "La imagen supera 5MB." }, { status: 400 });
    }

    const scope = form.get("scope");
    const prefix = typeof scope === "string" && /^[a-z0-9-]+$/i.test(scope) ? scope : "uploads";

    const blob = await put(`${prefix}/${crypto.randomUUID()}-${file.name}`, file, {
      access: "public",
      addRandomSuffix: false,
      // Token explícito: sin esto, el SDK intenta autenticar por OIDC
      // (via VERCEL_OIDC_TOKEN, que `vercel env pull` agrega solo) y ese
      // proyecto no tiene OIDC habilitado para el ambiente "development" —
      // falla incluso con BLOB_READ_WRITE_TOKEN presente en el entorno.
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return NextResponse.json({ url: blob.url, actorId: actor.userId }, { status: 201 });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}
