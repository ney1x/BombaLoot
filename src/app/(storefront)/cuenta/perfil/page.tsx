import type { Metadata } from "next";
import { PerfilView } from "@/components/PerfilView";
import { requireUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Perfil — BombaLoot" };

export default async function PerfilPage() {
  const user = await requireUser("/cuenta/perfil");
  return <PerfilView user={user} />;
}
