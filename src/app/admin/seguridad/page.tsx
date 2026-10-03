import type { Metadata } from "next";
import shared from "../shared.module.css";
import { IpBlocksManager } from "@/components/admin/IpBlocksManager";
import { getDb } from "@/server/db/client";
import { listBlockedIps } from "@/server/services/security-service";

export const metadata: Metadata = { title: "Seguridad — Admin BombaLoot" };

export default async function AdminSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ ip?: string }>;
}) {
  const [blocks, { ip }] = await Promise.all([listBlockedIps(getDb()), searchParams]);

  return (
    <div className={shared.page}>
      <div className={shared.headRow}>
        <div>
          <h1 className={shared.title}>Seguridad</h1>
          <p className={shared.subtitle}>
            IPs bloqueadas: no pueden registrarse, iniciar sesión, comprar ni abrir tickets de soporte.
          </p>
        </div>
      </div>

      <IpBlocksManager
        initialIp={ip}
        initialBlocks={blocks.map((b) => ({
          ip: b.ip,
          reason: b.reason,
          blockedByEmail: b.blockedByEmail,
          createdAt: b.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
