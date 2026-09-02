import styles from "../legal.module.css";

export const metadata = {
  title: "Términos y Condiciones — bombaloot",
};

export default function TerminosPage() {
  return (
    <div className={styles.wrap}>
      <h1>Términos y Condiciones</h1>
      <p className={styles.intro}>
        Bienvenido a <strong>BombaLoot</strong>. Al acceder, registrarte o realizar una compra en
        nuestro sitio web, aceptas los presentes Términos y Condiciones. Si no estás de acuerdo
        con ellos, te recomendamos no utilizar nuestros servicios.
      </p>

      <h2>1. Sobre BombaLoot</h2>
      <p>
        BombaLoot es una tienda digital dedicada a la comercialización de códigos, tarjetas
        digitales, monedas virtuales y otros productos relacionados con videojuegos y plataformas
        digitales.
      </p>
      <p>
        Los productos ofrecidos pueden estar sujetos a restricciones de región, plataforma, cuenta
        o disponibilidad.
      </p>
      <p>
        BombaLoot no es propietario de las marcas, videojuegos, plataformas o servicios de
        terceros mencionados en la tienda, salvo que se indique expresamente lo contrario.
      </p>

      <h2>2. Productos digitales</h2>
      <p>
        Todos los productos ofrecidos y entregados por BombaLoot son <strong>códigos de canje
        digitales</strong>.
      </p>
      <p>El código será enviado al cliente mediante el método de entrega indicado durante el proceso de compra.</p>
      <p>
        El cliente es responsable de verificar, antes de realizar la compra, que el código
        adquirido corresponde a la región, plataforma o servicio que necesita.
      </p>

      <h2>3. Proceso de compra</h2>
      <p>El cliente debe proporcionar información correcta y verificar su pedido antes de efectuar el pago.</p>
      <p>
        Una vez confirmado el pago, BombaLoot procesará el pedido y realizará la entrega del
        producto de acuerdo con el método correspondiente.
      </p>
      <p>En determinados productos, la entrega puede ser automática. En otros casos, puede requerir procesamiento manual.</p>
      <p>BombaLoot podrá solicitar información adicional cuando sea necesaria para completar correctamente un pedido.</p>

      <h2 id="reembolsos">4. Códigos y productos no utilizados</h2>
      <p>Los códigos digitales entregados se consideran productos de consumo digital.</p>
      <p>
        Una vez que un código ha sido mostrado o entregado al cliente,{" "}
        <strong>no podrá solicitarse un cambio o reembolso simplemente por haber cambiado de
        opinión</strong>, salvo que la legislación aplicable establezca lo contrario.
      </p>
      <p>Si un código presenta un problema, el cliente deberá comunicarse con BombaLoot antes de intentar venderlo, transferirlo o modificarlo.</p>

      <h2>5. Códigos inválidos o problemas con el producto</h2>
      <p>
        Si el cliente considera que un código no funciona, deberá comunicarse con BombaLoot a
        través de nuestros canales de atención y proporcionar la información necesaria para
        revisar el caso.
      </p>
      <p>BombaLoot podrá solicitar capturas de pantalla u otra información relacionada con el intento de canje para verificar el inconveniente.</p>
      <p>
        Una vez realizada la revisión, si se confirma que el código entregado corresponde al
        producto adquirido y fue proporcionado correctamente, BombaLoot no podrá hacerse
        responsable por su posterior uso, canje o estado, ya que no dispone de los medios
        necesarios para verificar de forma independiente quién utilizó el código o las
        circunstancias en las que fue utilizado.
      </p>
      <p>
        Por este motivo, <strong>una vez entregado correctamente el código, el cliente es
        responsable de mantenerlo seguro y de no compartirlo con terceros</strong>.
      </p>
      <p>Los reclamos relacionados con códigos deberán realizarse antes de compartir, publicar o intentar transferir el código a otra persona.</p>

      <h2>6. Restricciones de región</h2>
      <p>Algunos productos solamente funcionan en determinadas regiones o países.</p>
      <p>El cliente es responsable de comprobar las restricciones indicadas en la descripción del producto antes de comprar.</p>
      <p>BombaLoot no será responsable por compras realizadas para una región diferente a la indicada en el producto.</p>

      <h2>7. Precios y disponibilidad</h2>
      <p>Los precios y la disponibilidad de los productos pueden cambiar sin previo aviso.</p>
      <p>En caso de que ocurra un error evidente en el precio o disponibilidad de un producto, BombaLoot podrá cancelar la operación y realizar el reembolso correspondiente.</p>

      <h2>8. Pagos</h2>
      <p>Los pagos son procesados mediante los métodos de pago disponibles en el sitio.</p>
      <p>BombaLoot podrá cancelar o rechazar una operación cuando existan indicios razonables de fraude, uso no autorizado de un medio de pago o actividad sospechosa.</p>

      <h2>9. Cuentas de usuario</h2>
      <p>El cliente es responsable de mantener segura su cuenta y de la información utilizada para acceder a ella.</p>
      <p>No está permitido utilizar BombaLoot para actividades fraudulentas, ilegales o que puedan afectar el funcionamiento del sitio o a otros usuarios.</p>
      <p>BombaLoot podrá suspender o cancelar cuentas que incumplan estos términos.</p>

      <h2>10. Uso de marcas de terceros</h2>
      <p>Los nombres, logotipos, personajes, videojuegos y marcas mencionados en BombaLoot pertenecen a sus respectivos propietarios.</p>
      <p>Su utilización en el sitio tiene como finalidad identificar los productos ofrecidos.</p>
      <p>BombaLoot no afirma tener una relación comercial, asociación o autorización oficial con el propietario de una marca salvo que dicha relación se indique expresamente.</p>

      <h2>11. Limitación de responsabilidad</h2>
      <p>BombaLoot no será responsable por problemas ocasionados por:</p>
      <ul>
        <li>Errores en la información proporcionada por el cliente.</li>
        <li>Restricciones de región o plataforma.</li>
        <li>Cambios realizados por terceros en sus servicios.</li>
        <li>Suspensiones o restricciones aplicadas por plataformas externas.</li>
        <li>Interrupciones de servicios de terceros fuera del control de BombaLoot.</li>
      </ul>
      <p>Esto no limita los derechos que correspondan al consumidor conforme a la legislación aplicable.</p>

      <h2>12. Modificaciones</h2>
      <p>BombaLoot podrá modificar estos Términos y Condiciones cuando sea necesario.</p>
      <p>La versión vigente será la publicada en esta página.</p>

      <h2>13. Contacto</h2>
      <p>Si tienes dudas sobre una compra, producto o estos términos, puedes comunicarte con BombaLoot mediante los canales de atención disponibles en nuestro sitio web.</p>

      <p className={styles.footnote}>
        Al utilizar BombaLoot o realizar una compra, confirmas que has leído y aceptado estos
        Términos y Condiciones.
      </p>
    </div>
  );
}
