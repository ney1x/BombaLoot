import Link from "next/link";
import styles from "../legal.module.css";

export const metadata = {
  title: "Preguntas Frecuentes — BombaLoot",
};

const FAQS = [
  {
    q: "¿Cómo recibo mi código después de comprar?",
    a: "El código aparece directamente en tu pedido apenas confirmamos el pago con el proveedor. También lo enviamos por email como respaldo. En la mayoría de los productos la entrega es automática e instantánea.",
  },
  {
    q: "¿Necesito crear una cuenta para comprar?",
    a: "No. Podés comprar como invitado sin registrarte. Si querés llevar un historial de tus pedidos y acceder más fácil a soporte, podés crear una cuenta cuando quieras.",
  },
  {
    q: "¿Qué métodos de pago aceptan?",
    a: "Aceptamos Nequi y otros medios a través de Wompi, además de PayPal.",
  },
  {
    q: "Mi código no funciona, ¿qué hago?",
    a: "Escribinos por nuestros canales de atención con el número de pedido. Podemos pedirte una captura del intento de canje para revisar el caso antes de darte una respuesta.",
  },
  {
    q: "¿Puedo pedir un reembolso si cambio de opinión?",
    a: "Los códigos son productos digitales de consumo: una vez entregado o mostrado el código, no se puede solicitar cambio o reembolso por simple cambio de opinión, salvo que la ley aplicable indique lo contrario. Podés ver el detalle en nuestros Términos y Condiciones.",
  },
  {
    q: "¿Los códigos funcionan en cualquier región?",
    a: "No siempre. Algunos productos solo funcionan en determinadas regiones o plataformas. Revisá la descripción del producto antes de comprar para confirmar que corresponde a tu cuenta o región.",
  },
  {
    q: "¿Cuánto tarda en llegar mi pedido?",
    a: "La mayoría de los pedidos se entregan de forma instantánea apenas se confirma el pago. Algunos productos pueden requerir una revisión manual adicional, lo que puede tomar un poco más de tiempo.",
  },
  {
    q: "¿Cómo cuido la seguridad de mi código?",
    a: "Una vez entregado, el código es tu responsabilidad: no lo compartas ni lo publiques. No podemos verificar quién lo usó después de la entrega, así que cualquier reclamo debe hacerse antes de compartirlo con terceros.",
  },
];

export default function FaqPage() {
  return (
    <div className={styles.wrap}>
      <h1>Preguntas Frecuentes</h1>
      <p className={styles.intro}>
        Resolvé las dudas más comunes sobre compras, pagos y entrega de códigos en BombaLoot. Si
        no encontrás lo que buscás, visitá <Link href="/ayuda">Ayuda</Link>.
      </p>

      {FAQS.map((item) => (
        <div key={item.q}>
          <h2>{item.q}</h2>
          <p>{item.a}</p>
        </div>
      ))}
    </div>
  );
}
