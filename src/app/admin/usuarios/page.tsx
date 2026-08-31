import type { Metadata } from "next";
import Link from "next/link";
import shared from "../shared.module.css";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { listUsersAdmin } from "@/server/services/admin-users";
import { SupportRoleAction } from "@/components/admin/SupportRoleAction";

export const metadata: Metadata = { title: "Usuarios — Admin Loadout" };

const ROLE_TONE: Record<string, string | undefined> = { ADMIN: "accent", SUPPORT: "warn", CUSTOMER: undefined };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const [session, users] = await Promise.all([
    getCurrentSession(),
    listUsersAdmin(getDb(), {
      email: raw.email || undefined,
      role: (raw.role as "CUSTOMER" | "ADMIN" | "SUPPORT" | undefined) || undefined,
      limit: 50,
    }),
  ]);
  const canManageRoles = session?.role === "ADMIN";

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Usuarios</h1>
          <p className={shared.subtitle}>{users.length} resultado(s)</p>
        </div>
      </div>

      <form className={shared.filterForm} method="get">
        <input name="email" placeholder="Buscar por email" defaultValue={raw.email ?? ""} />
        <select name="role" defaultValue={raw.role ?? ""}>
          <option value="">Todos los roles</option>
          <option value="CUSTOMER">CUSTOMER</option>
          <option value="SUPPORT">SUPPORT</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <button type="submit" className={shared.btnSmall}>
          Filtrar
        </button>
        <Link href="/admin/usuarios" className={shared.btnSmall}>
          Limpiar
        </Link>
      </form>

      <div className={shared.tableWrap}>
        <table className={shared.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Compras</th>
              <th>Desde</th>
              {canManageRoles && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name ?? "—"}</td>
                <td>
                  <span className={shared.badge} data-tone={ROLE_TONE[u.role]}>
                    {u.role}
                  </span>
                </td>
                <td className="num-display">{u.purchasesCount}</td>
                <td>{u.createdAt.toLocaleDateString("es-CO")}</td>
                {canManageRoles && (
                  <td>
                    <SupportRoleAction userId={u.id} role={u.role} />
                  </td>
                )}
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={canManageRoles ? 6 : 5} className={shared.empty}>
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
