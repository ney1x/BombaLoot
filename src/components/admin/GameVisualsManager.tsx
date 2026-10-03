"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";
import { GAME_COLORS, type GameId } from "@/lib/products";

/**
 * Sube el archivo a /api/admin/upload (Vercel Blob) y devuelve la URL del
 * CDN. Separado de handleAdd para poder subir apenas se elige el archivo
 * (feedback inmediato) sin esperar a que se aprieta "Agregar banner".
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

/** Ancho/alto reales del archivo elegido, leídos en el browser antes de subir nada. */
function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

export type GameVisualPlacement = "hero" | "showcase" | "catalog";

export interface AdminGameVisual {
  id: string;
  productId: string | null;
  imageUrl: string;
  placement: GameVisualPlacement;
  title: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface GameProductOption {
  id: string;
  denomination: string;
  unit: string;
}

const PLACEMENT_LABEL: Record<GameVisualPlacement, string> = {
  hero: "Hero de Home (1200×1440)",
  showcase: "Elegí tu juego (600×800)",
  catalog: "Catálogo del juego (680×680, fallback)",
};

/** Ancho/alto de referencia por lugar — de acá sale la relación de aspecto esperada y el thumbnail. */
const PLACEMENT_DIMENSIONS: Record<GameVisualPlacement, { width: number; height: number }> = {
  hero: { width: 1200, height: 1440 },
  showcase: { width: 600, height: 800 },
  catalog: { width: 680, height: 680 },
};

/**
 * Solo el hero de Home rota por denominación — el panel "Elegí tu juego"
 * siempre mostró un panel por juego, nunca por producto puntual.
 */
function supportsProductTarget(placement: GameVisualPlacement): boolean {
  return placement === "hero";
}

/** Cuánto puede desviarse la relación de aspecto real antes de avisar — recorte leve es normal, uno grosero no. */
const ASPECT_RATIO_TOLERANCE = 0.15;

function aspectRatioWarning(
  placement: GameVisualPlacement,
  dims: { width: number; height: number },
): string | null {
  const expected = PLACEMENT_DIMENSIONS[placement];
  const expectedRatio = expected.width / expected.height;
  const actualRatio = dims.width / dims.height;
  const deviation = Math.abs(actualRatio - expectedRatio) / expectedRatio;
  if (deviation <= ASPECT_RATIO_TOLERANCE) return null;
  return `La imagen es ${dims.width}×${dims.height} — ${PLACEMENT_LABEL[placement]} espera una relación de aspecto de ~${expected.width}×${expected.height}. Se va a recortar distinto a como se ve acá.`;
}

/** Thumbnail con la forma real del lugar — un box 45×54 miente sobre cómo se ve un showcase (0.75:1, retrato). */
const THUMBNAIL_SIZE: Record<GameVisualPlacement, { width: number; height: number }> = {
  hero: { width: 34, height: 41 },
  showcase: { width: 45, height: 60 },
  catalog: { width: 48, height: 48 },
};

function VisualRow({
  visual,
  products,
  onToggle,
  onRemove,
}: {
  visual: AdminGameVisual;
  products: GameProductOption[];
  onToggle: () => void;
  onRemove: () => void;
}) {
  const thumb = THUMBNAIL_SIZE[visual.placement];
  const targetProduct = visual.productId ? products.find((p) => p.id === visual.productId) : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span className={shared.mono} style={{ fontSize: 11, color: "var(--ink-faint)", width: 18, textAlign: "right" }}>
        {visual.sortOrder}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail admin, no next/image optimization needed */}
      <img
        src={visual.imageUrl}
        alt={visual.title ?? ""}
        width={thumb.width}
        height={thumb.height}
        style={{ objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
      />
      <span
        className={shared.mono}
        style={{ fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {visual.imageUrl}
      </span>
      <span className={shared.badge} data-tone={visual.productId ? "accent" : undefined}>
        {targetProduct ? `${targetProduct.denomination} ${targetProduct.unit}` : visual.productId ? "producto eliminado" : "General"}
      </span>
      <span className={shared.badge} data-tone={visual.isActive ? "good" : "bad"}>
        {visual.isActive ? "ACTIVO" : "INACTIVO"}
      </span>
      <button type="button" className={shared.btnSmall} onClick={onToggle}>
        {visual.isActive ? "Desactivar" : "Activar"}
      </button>
      <button type="button" className={`${shared.btnSmall} ${shared.btnSmallDanger}`} onClick={onRemove}>
        Eliminar
      </button>
    </div>
  );
}

export function GameVisualsManager({
  gameId,
  gameLabel,
  initialVisuals,
  products,
}: {
  gameId: string;
  gameLabel: string;
  initialVisuals: AdminGameVisual[];
  products: GameProductOption[];
}) {
  const router = useRouter();
  const [visuals, setVisuals] = useState(initialVisuals);
  const [imageUrl, setImageUrl] = useState("");
  const [title, setTitle] = useState("");
  const [placement, setPlacement] = useState<GameVisualPlacement>("hero");
  const [productId, setProductId] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [uploadedDims, setUploadedDims] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dimensionWarning = uploadedDims ? aspectRatioWarning(placement, uploadedDims) : null;
  const accent = GAME_COLORS[gameId as GameId]?.base;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadedDims(null);
    setUploading(true);
    try {
      const [url, dims] = await Promise.all([uploadFile(file, `games/${gameId}`), readImageDimensions(file)]);
      setImageUrl(url);
      setUploadedDims(dims);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function refresh() {
    const res = await fetch(`/api/admin/games/${gameId}/visuals`);
    const data = await res.json();
    if (res.ok) setVisuals(data.visuals);
  }

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!imageUrl.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/games/${gameId}/visuals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: imageUrl.trim(),
          placement,
          productId: supportsProductTarget(placement) && productId ? productId : undefined,
          title: title.trim() || undefined,
          sortOrder,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el banner");
      setImageUrl("");
      setTitle("");
      setSortOrder(0);
      setProductId("");
      setUploadedDims(null);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(visualId: string, isActive: boolean) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/game-visuals/${visualId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar");
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  async function removeVisual(visualId: string) {
    if (!window.confirm("¿Eliminar este banner?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/game-visuals/${visualId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo eliminar");
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  return (
    <div className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 12, borderLeft: accent ? `3px solid ${accent}` : undefined }}>
      <h2 className={shared.title} style={{ fontSize: 15, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
        {accent && (
          <span
            aria-hidden="true"
            style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: accent }}
          />
        )}
        {gameLabel}
      </h2>
      {error && <div className={shared.formMsg} data-tone="bad">{error}</div>}

      <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className={shared.field} style={{ flex: "2 1 260px" }}>
          <label htmlFor={`file-${gameId}`}>Subir imagen (PNG/JPG/WEBP, máx. 5MB)</label>
          <input
            id={`file-${gameId}`}
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            onChange={handleFileChange}
            disabled={uploading}
          />
          {uploading && <span className={shared.subtitle}>Subiendo al CDN…</span>}
          {!uploading && imageUrl && (
            <span className={shared.mono} style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {imageUrl}
            </span>
          )}
        </div>
        <div className={shared.field} style={{ flex: "1 1 200px" }}>
          <label htmlFor={`placement-${gameId}`}>Lugar</label>
          <select
            id={`placement-${gameId}`}
            value={placement}
            onChange={(e) => setPlacement(e.target.value as GameVisualPlacement)}
          >
            <option value="hero">{PLACEMENT_LABEL.hero}</option>
            <option value="showcase">{PLACEMENT_LABEL.showcase}</option>
            <option value="catalog">{PLACEMENT_LABEL.catalog}</option>
          </select>
        </div>
        {supportsProductTarget(placement) && (
          <div className={shared.field} style={{ flex: "1 1 200px" }}>
            <label htmlFor={`product-${gameId}`}>Denominación</label>
            <select id={`product-${gameId}`} value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">General (todo el juego)</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.denomination} {p.unit}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={shared.field} style={{ flex: "1 1 160px" }}>
          <label htmlFor={`title-${gameId}`}>Título (opcional)</label>
          <input id={`title-${gameId}`} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className={shared.field} style={{ flex: "0 1 90px" }}>
          <label htmlFor={`order-${gameId}`}>Orden</label>
          <input
            id={`order-${gameId}`}
            type="number"
            min={0}
            max={10000}
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
          />
        </div>
        <button
          type="submit"
          className={`${shared.btnSmall} ${shared.btnSmallPrimary}`}
          disabled={submitting || uploading || !imageUrl.trim()}
        >
          {submitting ? "Guardando…" : "Agregar banner"}
        </button>
      </form>
      {dimensionWarning && (
        <div className={shared.formMsg} data-tone="warn">
          {dimensionWarning}
        </div>
      )}
      <details>
        <summary className={shared.subtitle} style={{ cursor: "pointer" }}>
          O pegar una URL ya alojada
        </summary>
        <div className={shared.field} style={{ marginTop: 8, maxWidth: 420 }}>
          <input
            aria-label="URL de imagen"
            value={imageUrl}
            onChange={(e) => {
              setImageUrl(e.target.value);
              setUploadedDims(null);
            }}
            placeholder="https://…"
          />
        </div>
      </details>

      {(["hero", "showcase", "catalog"] as const).map((p) => {
        const rows = visuals.filter((v) => v.placement === p);
        return (
          <div key={p} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className={shared.subtitle}>{PLACEMENT_LABEL[p]}</span>
            {rows.map((v) => (
              <VisualRow
                key={v.id}
                visual={v}
                products={products}
                onToggle={() => toggleActive(v.id, !v.isActive)}
                onRemove={() => removeVisual(v.id)}
              />
            ))}
            {rows.length === 0 && <p className={shared.subtitle}>Sin banners — se ve el placeholder.</p>}
          </div>
        );
      })}
    </div>
  );
}
