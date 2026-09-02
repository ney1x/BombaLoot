import type { Metadata } from "next";
import Link from "next/link";
import shared from "../shared.module.css";
import { getDb } from "@/server/db/client";
import { auditFiltersSchema, listAuditLogsAdmin } from "@/server/services/admin-audit";

export const metadata: Metadata = { title: "Auditoría — Admin bombaloot" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = auditFiltersSchema.safeParse({
    entityType: raw.entityType || undefined,
    action: raw.action || undefined,
  });
  const filters = parsed.success ? parsed.data : { limit: 100 };

  const entries = await listAuditLogsAdmin(getDb(), filters);

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Auditoría</h1>
          <p className={shared.subtitle}>Últimas {entries.length} acciones — solo lectura, append-only</p>
        </div>
      </div>

      <form className={shared.filterForm} method="get">
        <input name="entityType" placeholder="Tipo de entidad (product, order, code...)" defaultValue={raw.entityType ?? ""} />
        <input name="action" placeholder="Acción exacta (product.updated...)" defaultValue={raw.action ?? ""} />
        <button type="submit" className={shared.btnSmall}>
          Filtrar
        </button>
        <Link href="/admin/auditoria" className={shared.btnSmall}>
          Limpiar
        </Link>
      </form>

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
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{e.occurredAt.toLocaleString("es-CO")}</td>
                <td>
                  {e.actorType}
                  {e.actorEmail ? ` · ${e.actorEmail}` : ""}
                </td>
                <td className={shared.mono}>{e.action}</td>
                <td className={shared.mono}>
                  {e.entityType}:{e.entityId}
                </td>
                <td>
                  <code style={{ fontSize: 11 }}>{JSON.stringify(e.metadata)}</code>
                </td>
              </tr>
            ))}
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
    </div>
  );
}
