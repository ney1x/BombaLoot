"use client";

import { useState } from "react";
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
 * Sin subida de archivos: se pega la URL de una imagen ya alojada en un
 * CDN externo (no hay credenciales de storage configuradas todavía — ver
 * `admin-images.ts`). Varias imágenes por producto, una marcada
 * "Principal" — el backend garantiza que solo una quede así.
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
              <label htmlFor="imageUrl">URL de la imagen (ya alojada en un CDN)</label>
              <input
                id="imageUrl"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://cdn.example.com/valorant-565.png"
                required
              />
            </div>
            <div className={shared.field}>
              <label htmlFor="altText">Texto alternativo</label>
              <input id="altText" value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="565 VP — Valorant" />
            </div>
          </div>
          <div className={shared.actions}>
            <button type="submit" className={`${shared.btnSmall} ${shared.btnSmallPrimary}`} disabled={submitting}>
              {submitting ? "Agregando…" : "Agregar imagen"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
