"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import shared from "@/app/admin/shared.module.css";

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

export type GameVisualPlacement = "hero" | "showcase";

export interface AdminGameVisual {
  id: string;
  imageUrl: string;
  placement: GameVisualPlacement;
  title: string | null;
  sortOrder: number;
  isActive: boolean;
}

const PLACEMENT_LABEL: Record<GameVisualPlacement, string> = {
  hero: "Hero de Home (1600×670)",
  showcase: "Elegí tu juego (600×800)",
};

function VisualRow({
  visual,
  onToggle,
  onRemove,
}: {
  visual: AdminGameVisual;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail admin, no next/image optimization needed */}
      <img
        src={visual.imageUrl}
        alt={visual.title ?? ""}
        width={72}
        height={30}
        style={{ objectFit: "cover", borderRadius: 4 }}
      />
      <span
        className={shared.mono}
        style={{ fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {visual.imageUrl}
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
}: {
  gameId: string;
  gameLabel: string;
  initialVisuals: AdminGameVisual[];
}) {
  const router = useRouter();
  const [visuals, setVisuals] = useState(initialVisuals);
  const [imageUrl, setImageUrl] = useState("");
  const [title, setTitle] = useState("");
  const [placement, setPlacement] = useState<GameVisualPlacement>("hero");
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
      const url = await uploadFile(file, `games/${gameId}`);
      setImageUrl(url);
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
        body: JSON.stringify({ imageUrl: imageUrl.trim(), placement, title: title.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el banner");
      setImageUrl("");
      setTitle("");
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
    <div className={shared.card} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ fontSize: 15, margin: 0 }}>{gameLabel}</h3>
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
          </select>
        </div>
        <div className={shared.field} style={{ flex: "1 1 160px" }}>
          <label htmlFor={`title-${gameId}`}>Título (opcional)</label>
          <input id={`title-${gameId}`} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <button
          type="submit"
          className={`${shared.btnSmall} ${shared.btnSmallPrimary}`}
          disabled={submitting || uploading || !imageUrl.trim()}
        >
          {submitting ? "Guardando…" : "Agregar banner"}
        </button>
      </form>
      <details>
        <summary className={shared.subtitle} style={{ cursor: "pointer" }}>
          O pegar una URL ya alojada
        </summary>
        <div className={shared.field} style={{ marginTop: 8, maxWidth: 420 }}>
          <input
            aria-label="URL de imagen"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
      </details>

      {(["hero", "showcase"] as const).map((p) => {
        const rows = visuals.filter((v) => v.placement === p);
        return (
          <div key={p} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className={shared.subtitle}>{PLACEMENT_LABEL[p]}</span>
            {rows.map((v) => (
              <VisualRow key={v.id} visual={v} onToggle={() => toggleActive(v.id, !v.isActive)} onRemove={() => removeVisual(v.id)} />
            ))}
            {rows.length === 0 && <p className={shared.subtitle}>Sin banners — se ve el placeholder.</p>}
          </div>
        );
      })}
    </div>
  );
}
