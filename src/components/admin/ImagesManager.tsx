"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

export interface AdminImage {
  id: string;
  imageUrl: string;
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
  isActive: boolean;
}

/**
 * Sube el archivo a /api/admin/upload (Vercel Blob) y devuelve la URL del
 * CDN — mismo helper que GameVisualsManager, subida inmediata al elegir el
 * archivo en vez de esperar al submit del form.
 */
async function uploadFile(file: File, scope: string): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("scope", scope);
  const res = await fetch("/api/admin/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "No se pudo subir la imagen");
  return data.url as string;
}

/**
 * Subida de archivo real (Vercel Blob) con la URL pegada a mano como
 * alternativa — mismo criterio que GameVisualsManager. Varias imágenes por
 * producto, una marcada "Principal" — el backend garantiza que solo una
 * quede así.
 */
export function ImagesManager({
  productId,
  initialImages,
  canEdit,
}: {
  productId: string;
  initialImages: AdminImage[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [images, setImages] = useState(initialImages);
  const [imageUrl, setImageUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadFile(file, `products/${productId}`);
      setImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function refresh() {
    const res = await fetch(`/api/admin/products/${productId}/images`);
    const data = await res.json();
    if (res.ok) setImages(data.images);
  }

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/products/${productId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: imageUrl.trim(),
          altText: altText.trim() || undefined,
          isPrimary: images.length === 0,
          sortOrder: images.length,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo agregar la imagen");
      setImageUrl("");
      setAltText("");
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  async function makePrimary(imageId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/images/${imageId}/primary`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo marcar como principal");
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  async function removeImage(imageId: string) {
    if (!window.confirm("¿Eliminar esta imagen?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/images/${imageId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo eliminar");
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && <div className={shared.formMsg} data-tone="bad">{error}</div>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        {images.map((img) => (
          <div key={img.id} className={shared.card} style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {/* URL externa arbitraria (CDN de terceros aún no configurado) — next/image exigiría whitelistear dominios que no existen todavía */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.imageUrl}
              alt={img.altText ?? ""}
              style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 6, opacity: img.isActive ? 1 : 0.4 }}
            />
            {img.isPrimary && (
              <span className={shared.badge} data-tone="good">
                PRINCIPAL
              </span>
            )}
            {canEdit && (
              <div className={shared.actions}>
                {!img.isPrimary && (
                  <button type="button" className={shared.btnSmall} onClick={() => makePrimary(img.id)}>
                    Hacer principal
                  </button>
                )}
                <button type="button" className={`${shared.btnSmall} ${shared.btnSmallDanger}`} onClick={() => removeImage(img.id)}>
                  Eliminar
                </button>
              </div>
            )}
          </div>
        ))}
        {images.length === 0 && <p className={shared.subtitle}>Sin imágenes cargadas.</p>}
      </div>

      {canEdit && (
        <form onSubmit={handleAdd} className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className={shared.formGrid}>
            <div className={shared.field}>
              <label htmlFor="imageFile">Subir imagen (PNG/JPG/WEBP, máx. 5MB)</label>
              <input
                id="imageFile"
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                onChange={handleFileChange}
                disabled={uploading}
              />
              {uploading && <span className={shared.subtitle}>Subiendo al CDN…</span>}
              {!uploading && imageUrl && (
                <span
                  className={shared.mono}
                  style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {imageUrl}
                </span>
              )}
            </div>
            <div className={shared.field}>
              <label htmlFor="altText">Texto alternativo</label>
              <input id="altText" value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="565 VP — Valorant" />
            </div>
          </div>
          <details>
            <summary className={shared.subtitle} style={{ cursor: "pointer" }}>
              O pegar una URL ya alojada
            </summary>
            <div className={shared.field} style={{ marginTop: 8, maxWidth: 420 }}>
              <input
                aria-label="URL de imagen"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://cdn.example.com/valorant-565.png"
              />
            </div>
          </details>
          <div className={shared.actions}>
            <button
              type="submit"
              className={`${shared.btnSmall} ${shared.btnSmallPrimary}`}
              disabled={submitting || uploading || !imageUrl.trim()}
            >
              {submitting ? "Agregando…" : "Agregar imagen"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
