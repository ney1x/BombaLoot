import Link from "next/link";
import { Suspense } from "react";
import styles from "../legal.module.css";
import { SupportRecentTickets } from "@/components/SupportRecentTickets";
import { SupportTicketForm } from "@/components/SupportTicketForm";

export const metadata = {
  title: "Ayuda — BombaLoot",
};

export default function AyudaPage() {
  return (
    <div className={styles.wrap}>
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
