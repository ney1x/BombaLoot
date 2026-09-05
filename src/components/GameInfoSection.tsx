import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./GameInfoSection.module.css";
import { ChevronDownIcon } from "./icons";
import { GAMES, type GameId } from "@/lib/products";
import { faqPageJsonLd } from "@/lib/seo";

/**
 * Para qué se usa la moneda/saldo de cada juego — es información pública
 * sobre el juego en sí (no una promesa de BombaLoot), así que es segura de
 * afirmar sin verificarla contra ningún dato propio del sitio.
 */
const WHAT_FOR: Record<GameId, string> = {
  valorant: "comprar skins, el Battle Pass y otros ítems cosméticos dentro de Valorant",
  roblox: "comprar ítems, pases y contenido dentro de tus juegos de Roblox",
  league: "comprar skins, campeones y otros ítems dentro de League of Legends",
  overwatch: "comprar ítems de la tienda de Overwatch",
};

/**
 * Anchor text descriptivo para el link cruzado a cada juego (Fase 6: nada
 * de "Ver más" — el texto visible del link ya dice qué se compra). Mismos
 * términos reales que `GAME_SEO`/`WHAT_FOR`, no inventados acá.
 */
const BUY_LABEL: Record<GameId, string> = {
  valorant: "Comprar VP de Valorant",
  roblox: "Comprar Robux de Roblox",
  league: "Comprar RP de League of Legends",
  overwatch: "Recargar saldo de Overwatch",
};

interface QaItem {
  question: string;
  /** Texto plano — es lo que lee `faqPageJsonLd` (Fase 8). */
  answer: string;
  /** Versión visible, con links de verdad — si no está, se muestra `answer` tal cual. */
  answerNode?: ReactNode;
}

/**
 * Responde las preguntas reales que alguien se hace antes de comprar —
 * qué puede comprar, cómo funciona, qué necesita, qué métodos de pago hay,
 * qué tener en cuenta. Cada dato sale de una fuente real ya existente en el
 * sitio, no inventado acá:
 *
 * - Proceso/tiempos: mismo texto que `HowItWorks.tsx` (home).
 * - Métodos de pago: mismos 4 que `PAYMENT_METHODS` en `lib/checkout.ts` y
 *   que ya se muestran como pills en `GamePurchase.tsx`. Nequi/PSE piden
 *   cuenta colombiana; tarjeta (Wompi) acepta Colombia Y exterior — no es
 *   "tarjeta = Colombia, exterior = PayPal" (así decía antes acá y en el
 *   `region` de `checkout.ts`, corregido: la doc de soporte de Wompi
 *   confirma que procesa Visa/Mastercard/Amex emitidas en cualquier país).
 * - Qué pide Nequi (nombre/cédula/celular): mismos campos de `CheckoutView.tsx`.
 * - "Qué tener en cuenta": mismo criterio que `/terminos` §4-5 (sin cambio
 *   de opinión una vez revelado el código, sí ante un problema real).
 *
 * Una sola función arma los 5 pares — `GameInfoSection` los renderiza en
 * pantalla Y como `FAQPage` (Fase 8, JSON-LD) desde la MISMA lista, así
 * que nunca puede haber texto distinto entre lo visible y lo que lee
 * Google (mismo criterio que `Breadcrumb.tsx`, Fase 7).
 */
function qaItems(game: { id: GameId; label: string }): QaItem[] {
  return [
    {
      question: "¿Qué puedo comprar?",
      answer: `Tu recarga de ${game.label} sirve para ${WHAT_FOR[game.id]}.`,
    },
    {
      question: "¿Cómo funciona la recarga y cuánto tarda?",
      answer:
        "Elegís la denominación y pagás — confirmamos el pago directo con el proveedor y el código queda disponible en tu pedido al instante, más una copia por email como respaldo.",
    },
    {
      question: "¿Qué necesito para comprar?",
      answer:
        "Solo tu email — no hace falta crear una cuenta. Si pagás con Nequi, además pedimos nombre, cédula y número de celular para procesar el pago.",
    },
    {
      question: "¿Qué métodos de pago hay?",
      answer:
        "Nequi y PSE necesitan cuenta bancaria o Nequi colombiana. Tarjeta débito/crédito (Visa, Mastercard y más) funciona con tarjetas colombianas y también del exterior — Wompi las acepta a ambas. Y si preferís, también podés pagar con PayPal.",
    },
    {
      question: "¿Qué debo tener en cuenta?",
      answer:
        "Es un código digital: una vez revelado, no aplica cambio por haber cambiado de opinión — sí ante un problema real con el código, contactando soporte. Fijate bien en la denominación antes de comprar. El detalle completo está en los Términos y Condiciones.",
      answerNode: (
        <>
          Es un código digital: una vez revelado, no aplica cambio por haber cambiado de
          opinión — sí ante un problema real con el código, <Link href="/ayuda">contactando
          soporte</Link>. Fijate bien en la denominación antes de comprar. El detalle completo
          está en los <Link href="/terminos">Términos y Condiciones</Link>.
        </>
      ),
    },
  ];
}

export function GameInfoSection({ game }: { game: { id: GameId; label: string } }) {
  const items = qaItems(game);
  return (
    <section className={styles.section}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: faqPageJsonLd(items.map(({ question, answer }) => ({ question, answer }))),
        }}
      />
      <h2 className={styles.heading}>Preguntas sobre tu recarga de {game.label}</h2>
      <div className={styles.accordion}>
        {items.map((item, index) => (
          <details className={styles.item} key={item.question} open={index === 0}>
            <summary className={styles.itemSummary}>
              <h3>{item.question}</h3>
              <ChevronDownIcon className={styles.itemChevron} aria-hidden="true" />
            </summary>
            <p className={styles.itemAnswer}>{item.answerNode ?? item.answer}</p>
          </details>
        ))}
      </div>
      <p className={styles.more}>
        ¿Tenés otra duda? Mirá las <Link href="/faq">preguntas frecuentes</Link>.
      </p>
    </section>
  );
}

/**
 * Enlazado cruzado entre juegos (Fase 6) — antes ninguna página de juego
 * linkeaba a las otras 3, solo a `/catalogo` entero. Sección propia, no dos
 * `<h2>` adentro de `GameInfoSection`: un `<section>` = un heading.
 * `BUY_LABEL` es el anchor text — nunca "Ver más", ya dice qué se compra.
 */
export function RelatedGamesSection({ game }: { game: { id: GameId } }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>También podés recargar</h2>
      <ul className={styles.otherGames}>
        {GAMES.filter((g) => g.id !== game.id).map((g) => (
          <li key={g.id}>
            <Link href={`/catalogo/${g.id}`}>{BUY_LABEL[g.id]}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
