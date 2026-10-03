import type { Metadata } from "next";
import Link from "next/link";
import shared from "../shared.module.css";
import { getCurrentSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { listUsersAdmin } from "@/server/services/admin-users";
import { listPendingAdminInvites } from "@/server/services/admin-service";
import { SupportRoleAction } from "@/components/admin/SupportRoleAction";
import { SuspendAction } from "@/components/admin/SuspendAction";
import { UserDetailToggle } from "@/components/admin/UserDetailToggle";
import { AdminInviteManager } from "@/components/admin/AdminInviteManager";

export const metadata: Metadata = { title: "Usuarios — Admin BombaLoot" };

const ROLE_TONE: Record<string, string | undefined> = {
  SUPERADMIN: "accent",
  ADMIN: "accent",
  SUPPORT: "warn",
  CUSTOMER: undefined,
};

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
      role: (raw.role as "CUSTOMER" | "ADMIN" | "SUPPORT" | "SUPERADMIN" | undefined) || undefined,
      limit: 50,
    }),
  ]);
  const canManageRoles = session?.role === "ADMIN" || session?.role === "SUPERADMIN";
  const canManageAdmins = session?.role === "SUPERADMIN";
  const canSuspend = session?.role === "ADMIN" || session?.role === "SUPPORT" || session?.role === "SUPERADMIN";
  const invites = canManageAdmins ? await listPendingAdminInvites(getDb()) : [];

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Usuarios</h1>
          <p className={shared.subtitle}>{users.length} resultado(s)</p>
        </div>
      </div>

      {canManageAdmins && (
        <AdminInviteManager
          initialInvites={invites.map((i) => ({
            id: i.id,
            email: i.email,
            invitedByEmail: i.invitedByEmail,
            expiresAt: i.expiresAt.toISOString(),
            createdAt: i.createdAt.toISOString(),
          }))}
        />
      )}

      <form className={shared.filterForm} method="get">
        <input name="email" placeholder="Buscar por email" defaultValue={raw.email ?? ""} />
        <select name="role" defaultValue={raw.role ?? ""}>
          <option value="">Todos los roles</option>
          <option value="CUSTOMER">CUSTOMER</option>
          <option value="SUPPORT">SUPPORT</option>
          <option value="ADMIN">ADMIN</option>
          <option value="SUPERADMIN">SUPERADMIN</option>
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
              {canManageRoles && <th>Cambiar rol</th>}
              {canSuspend && <th>Cuenta</th>}
              <th>Nombre</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Compras</th>
              <th>Desde</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <UserDetailToggle userId={u.id} email={u.email} />
                </td>
                {canManageRoles && (
                  <td>
                    <SupportRoleAction
                      userId={u.id}
                      role={u.role}
                      isSelf={session?.userId === u.id}
                      wasAdmin={u.wasAdmin}
                      canManageAdmins={canManageAdmins}
                    />
                  </td>
                )}
                {canSuspend && (
                  <td>
                    <SuspendAction
                      userId={u.id}
                      role={u.role}
                      suspended={Boolean(u.suspendedAt)}
                      isSelf={session?.userId === u.id}
                    />
                  </td>
                )}
                <td>{u.name ?? "—"}</td>
                <td>
                  <span className={shared.badge} data-tone={ROLE_TONE[u.role]}>
                    {u.role}
                  </span>
                </td>
                <td>
                  {u.suspendedAt ? (
                    <span className={shared.badge} data-tone="bad" title={u.suspendedReason ?? undefined}>
                      SUSPENDIDA
                    </span>
                  ) : (
                    <span className={shared.badge} data-tone="good">
                      ACTIVA
                    </span>
                  )}
                </td>
                <td className="num-display">{u.purchasesCount}</td>
                <td>{u.createdAt.toLocaleDateString("es-CO")}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6 + (canManageRoles ? 1 : 0) + (canSuspend ? 1 : 0)} className={shared.empty}>
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
