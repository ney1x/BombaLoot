import Link from "next/link";
import { Suspense } from "react";
import styles from "../legal.module.css";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SupportRecentTickets } from "@/components/SupportRecentTickets";
import { SupportTicketForm } from "@/components/SupportTicketForm";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Ayuda y soporte | BombaLoot",
  description: "Contactá a soporte de BombaLoot — abrí un ticket por tu pedido, tu código o tu cuenta.",
  path: "/ayuda",
});

export default function AyudaPage() {
  return (
    <div className={styles.wrap}>
      <Breadcrumb items={[{ name: "Home", path: "" }, { name: "Ayuda", path: "/ayuda" }]} />
      <h1>Ayuda</h1>
      <p className={styles.intro}>
        ¿Problema con una compra puntual? Contanos qué pasó y seguí la conversación con soporte
        acá mismo — sin necesidad de cuenta.
      </p>

      <SupportRecentTickets />
      <Suspense fallback={null}>
        <SupportTicketForm />
      </Suspense>

      <h2>Otros recursos</h2>
      <ul>
        <li><Link href="/faq">Preguntas frecuentes</Link></li>
        <li><Link href="/terminos">Términos y Condiciones</Link></li>
        <li><Link href="/privacidad">Políticas de privacidad</Link></li>
        <li><Link href="/cookies">Política de cookies</Link></li>
      </ul>
    </div>
  );
}
