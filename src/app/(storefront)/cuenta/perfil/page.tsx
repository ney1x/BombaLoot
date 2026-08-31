import type { Metadata } from "next";
import { PerfilView } from "@/components/PerfilView";
import { requireUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Perfil — bombaloot" };

export default async function PerfilPage() {
  const user = await requireUser("/cuenta/perfil");
  return <PerfilView user={user} />;
}
