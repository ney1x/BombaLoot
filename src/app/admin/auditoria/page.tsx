import type { Metadata } from "next";
import Link from "next/link";
import shared from "../shared.module.css";
import { getDb } from "@/server/db/client";
import { auditFiltersSchema, listAuditLogsAdmin } from "@/server/services/admin-audit";

export const metadata: Metadata = { title: "Auditoría — Admin bombaloot" };

const ACTOR_TONE: Record<string, string | undefined> = {
  ADMIN: "accent",
  SUPPORT: "warn",
  SYSTEM: undefined,
  CUSTOMER: undefined,
};

/**
 * Heurística sobre el nombre de la acción — `audit_logs` no tiene una columna
 * de severidad propia, así que esto es una lectura del texto, no una fuente
 * de verdad. Restaurativas primero (para que "unblocked"/"reactivated" no
 * matcheen la regla "bad" de "blocked"/"suspend" por substring).
 */
function actionTone(action: string): string | undefined {
  const a = action.toLowerCase();
  if (/unblock|unsuspend|reactivat|resolved|completed/.test(a)) return "good";
  if (/blocked|suspend|delet|fail|reject|denied|refund|manual_review/.test(a)) return "bad";
  if (/creat|toggl/.test(a)) return "warn";
  return undefined;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = auditFiltersSchema.safeParse({
    entityType: raw.entityType || undefined,
    entityId: raw.entityId || undefined,
    action: raw.action || undefined,
    from: raw.from || undefined,
    to: raw.to || undefined,
    before: raw.before || undefined,
  });
  const filters = parsed.success ? parsed.data : { limit: 100 };

  const entries = await listAuditLogsAdmin(getDb(), filters);
  const hitCap = entries.length === filters.limit;
  const oldest = entries[entries.length - 1];
  const olderParams = new URLSearchParams(
    Object.entries(raw).filter(([k, v]) => v && k !== "before") as [string, string][],
  );
  if (oldest) olderParams.set("before", oldest.occurredAt.toISOString());

  const ENTITY_LINK: Record<string, (id: string) => string> = {
    product: (id) => `/admin/productos/${id}`,
    order: (id) => `/admin/pedidos/${id}`,
  };

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Auditoría</h1>
          <p className={shared.subtitle}>Últimas {entries.length} acciones — solo lectura, append-only</p>
        </div>
      </div>

      <form className={shared.filterForm} method="get">
        <input name="entityType" placeholder="Tipo de entidad (contiene, ej. product)" defaultValue={raw.entityType ?? ""} />
        <input name="entityId" placeholder="ID de entidad exacto" defaultValue={raw.entityId ?? ""} />
        <input name="action" placeholder="Acción (contiene, ej. updated)" defaultValue={raw.action ?? ""} />
        <input type="date" name="from" aria-label="Desde" defaultValue={raw.from ?? ""} />
        <input type="date" name="to" aria-label="Hasta" defaultValue={raw.to ?? ""} />
        <button type="submit" className={shared.btnSmall}>
          Filtrar
        </button>
        <Link href="/admin/auditoria" className={shared.btnSmall}>
          Limpiar
        </Link>
      </form>
      <p className={shared.subtitle}>
        Tipo/acción son búsqueda parcial, sin importar mayúsculas — no hace falta el nombre exacto.
      </p>

      <div className={shared.tableWrap}>
        <table className={shared.table}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Actor</th>
              <th>Acción</th>
              <th>Entidad</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const link = ENTITY_LINK[e.entityType]?.(e.entityId);
              const metadataText =
                e.metadata && Object.keys(e.metadata).length > 0 ? JSON.stringify(e.metadata, null, 2) : null;
              return (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{e.occurredAt.toLocaleString("es-CO")}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className={shared.badge} data-tone={ACTOR_TONE[e.actorType]}>
                        {e.actorType}
                      </span>
                      {e.actorEmail && <span className={shared.subtitle}>{e.actorEmail}</span>}
                    </div>
                  </td>
                  <td className={shared.mono}>
                    <span className={shared.badge} data-tone={actionTone(e.action)}>
                      {e.action}
                    </span>
                  </td>
                  <td className={shared.mono}>
                    {link ? (
                      <Link href={link}>
                        {e.entityType}:{e.entityId}
                      </Link>
                    ) : (
                      `${e.entityType}:${e.entityId}`
                    )}
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    {metadataText ? (
                      <pre
                        style={{
                          margin: 0,
                          fontSize: 11,
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {metadataText}
                      </pre>
                    ) : (
                      <span className={shared.subtitle}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className={shared.empty}>
                  Sin eventos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hitCap && oldest && (
        <div className={shared.formMsg} data-tone="warn" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span>
            Se llegó al límite de {filters.limit} eventos mostrados — puede haber más antiguos sin listar. Angostá
            el filtro por fecha o seguí a los anteriores.
          </span>
          <Link href={`/admin/auditoria?${olderParams.toString()}`} className={shared.btnSmall}>
            Ver eventos anteriores →
          </Link>
        </div>
      )}
    </div>
  );
}
