import Link from "next/link";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandCol}>
          <div className={styles.logo}>
            LOAD<span>OUT</span>
          </div>
          <p>
            Recarga de saldo y códigos digitales para tus juegos favoritos. Pago
            verificado, entrega automática apenas se confirma.
          </p>
        </div>
        <div>
          <div className={styles.colTitle}>Tienda</div>
          <ul className={styles.colList}>
            <li><Link href="/catalogo">Catálogo</Link></li>
            <li><Link href="/carrito">Carrito</Link></li>
            <li><Link href="/cuenta/login">Mi cuenta</Link></li>
          </ul>
        </div>
        <div>
          <div className={styles.colTitle}>Confianza</div>
          <ul className={styles.colList}>
            <li><Link href="/soporte">Cómo funciona</Link></li>
            <li><Link href="/soporte#reembolsos">Política de reembolsos</Link></li>
            <li><Link href="/soporte#privacidad">Privacidad</Link></li>
          </ul>
        </div>
        <div>
          <div className={styles.colTitle}>Soporte</div>
          <ul className={styles.colList}>
            <li><Link href="/soporte">Centro de ayuda</Link></li>
            <li><Link href="/soporte#contacto">Contacto</Link></li>
          </ul>
        </div>
      </div>
      <div className={styles.bottom}>© 2026 Loadout</div>
    </footer>
  );
}
