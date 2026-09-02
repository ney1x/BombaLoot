import Link from "next/link";
import styles from "../legal.module.css";

export const metadata = {
  title: "Política de Privacidad — bombaloot",
};

export default function PrivacidadPage() {
  return (
    <div className={styles.wrap}>
      <h1>Política de Privacidad</h1>
      <p className={styles.intro}>
        En BombaLoot nos comprometemos a proteger la privacidad y la información personal de
        nuestros usuarios. Esta Política de Privacidad explica qué información podemos recopilar,
        cómo la utilizamos y qué derechos tienes sobre tus datos al utilizar nuestro sitio web y
        nuestros servicios.
      </p>
      <p>Al utilizar BombaLoot, aceptas las prácticas descritas en esta Política de Privacidad.</p>

      <h2>1. Información que recopilamos</h2>
      <p>Dependiendo de cómo utilices BombaLoot, podemos recopilar información como:</p>
      <ul>
        <li>Nombre o nombre de usuario.</li>
        <li>Dirección de correo electrónico.</li>
        <li>Información necesaria para procesar y entregar tus pedidos.</li>
        <li>Historial de compras y pedidos.</li>
        <li>
          Contenido de tus solicitudes de soporte: el motivo de contacto, el número de pedido que
          indiques, y los mensajes que intercambiés con nuestro equipo dentro de esa conversación.
        </li>
        <li>Dirección IP y datos técnicos del dispositivo.</li>
        <li>Información sobre el uso y navegación dentro de nuestro sitio web.</li>
        <li>Información necesaria para prevenir fraudes y proteger nuestras operaciones.</li>
      </ul>
      <p>BombaLoot únicamente recopilará la información necesaria para prestar y mejorar nuestros servicios.</p>

      <h2>2. Información de pago</h2>
      <p>Los pagos realizados en BombaLoot pueden ser procesados mediante proveedores de servicios de pago externos.</p>
      <p>
        <strong>BombaLoot no almacena directamente los datos completos de tarjetas de crédito o
        débito</strong>, salvo que se indique expresamente lo contrario.
      </p>
      <p>Los proveedores de pago pueden recopilar y procesar información de acuerdo con sus propias políticas de privacidad y términos de servicio.</p>

      <h2>3. Cómo utilizamos la información</h2>
      <p>Podemos utilizar la información recopilada para:</p>
      <ul>
        <li>Procesar y gestionar tus compras.</li>
        <li>Entregar los productos adquiridos.</li>
        <li>Crear y administrar tu cuenta.</li>
        <li>Brindar atención y soporte al cliente.</li>
        <li>Responder consultas y solicitudes.</li>
        <li>Detectar y prevenir fraudes, abusos y actividades no autorizadas.</li>
        <li>Mantener la seguridad de BombaLoot.</li>
        <li>Mejorar nuestros productos, servicios y experiencia de usuario.</li>
        <li>Analizar el funcionamiento y rendimiento de nuestro sitio web.</li>
        <li>Cumplir obligaciones legales o requerimientos de autoridades competentes.</li>
      </ul>
      <p>No utilizaremos tus datos personales para fines incompatibles con aquellos para los que fueron recopilados.</p>

      <h2>4. Comunicaciones</h2>
      <p>Podemos utilizar tu correo electrónico para enviarte comunicaciones relacionadas con:</p>
      <ul>
        <li>Confirmaciones de compra.</li>
        <li>Información sobre tus pedidos.</li>
        <li>Entrega de productos.</li>
        <li>Solicitudes de soporte.</li>
        <li>Cambios importantes en nuestros servicios o políticas.</li>
      </ul>
      <p>Si posteriormente utilizamos medios de contacto para comunicaciones comerciales o promocionales, podrás solicitar dejar de recibirlas cuando corresponda.</p>

      <h2>5. Compartir información con terceros</h2>
      <p>Podemos compartir determinada información con proveedores que nos ayudan a operar BombaLoot, incluyendo:</p>
      <ul>
        <li>Proveedores de procesamiento de pagos.</li>
        <li>Servicios de alojamiento e infraestructura.</li>
        <li>Servicios de correo electrónico y comunicación.</li>
        <li>Herramientas de análisis y medición.</li>
        <li>Proveedores necesarios para procesar o entregar determinados productos.</li>
        <li>Servicios utilizados para prevenir fraude y proteger la seguridad de la plataforma.</li>
      </ul>
      <p>Estos terceros solo recibirán la información necesaria para prestar los servicios correspondientes.</p>
      <p>
        También podremos divulgar información cuando sea necesario para cumplir una obligación
        legal, responder a una solicitud válida de una autoridad competente, prevenir fraude o
        proteger los derechos y la seguridad de BombaLoot y sus usuarios.
      </p>

      <h2>6. Cookies y tecnologías similares</h2>
      <p>BombaLoot puede utilizar cookies y tecnologías similares para:</p>
      <ul>
        <li>Mantener sesiones iniciadas.</li>
        <li>Recordar preferencias.</li>
        <li>Mantener el funcionamiento del carrito y otras funciones del sitio.</li>
        <li>Comprender cómo se utiliza nuestro sitio.</li>
        <li>Mejorar el rendimiento y la experiencia del usuario.</li>
        <li>Medir determinadas actividades y resultados.</li>
      </ul>
      <p>Puedes controlar o eliminar las cookies desde la configuración de tu navegador.</p>
      <p>
        Para obtener más información, consulta nuestra{" "}
        <Link href="/cookies">Política de Cookies</Link>.
      </p>

      <h2>7. Conservación de la información</h2>
      <p>
        Conservaremos la información personal durante el tiempo necesario para cumplir con los
        fines descritos en esta política, prestar nuestros servicios, resolver posibles
        reclamaciones y cumplir con nuestras obligaciones legales.
      </p>
      <p>Cuando la información ya no sea necesaria, podremos eliminarla o anonimizarla de acuerdo con nuestras prácticas y obligaciones legales.</p>

      <h2>8. Seguridad</h2>
      <p>
        BombaLoot implementa medidas técnicas y organizativas razonables para proteger la
        información personal contra accesos no autorizados, pérdida, alteración, divulgación o
        uso indebido.
      </p>
      <p>Sin embargo, ningún sistema conectado a Internet puede garantizar una seguridad absoluta.</p>
      <p>Los usuarios también son responsables de proteger sus credenciales de acceso y de no compartir información de su cuenta con terceros.</p>

      <h2>9. Derechos del usuario</h2>
      <p>De acuerdo con la legislación aplicable, puedes tener derecho a:</p>
      <ul>
        <li>Conocer qué información personal tenemos sobre ti.</li>
        <li>Solicitar la actualización o corrección de información incorrecta.</li>
        <li>Solicitar la eliminación de información cuando legalmente corresponda.</li>
        <li>Consultar el uso que hacemos de tus datos.</li>
        <li>Revocar determinadas autorizaciones cuando sea aplicable.</li>
        <li>Presentar consultas o reclamaciones relacionadas con el tratamiento de tus datos.</li>
      </ul>
      <p>Para ejercer estos derechos, puedes comunicarte con nosotros mediante los canales de contacto disponibles en BombaLoot.</p>

      <h2>10. Privacidad de menores</h2>
      <p>BombaLoot no busca recopilar intencionalmente información personal de menores cuando dicha recopilación no esté permitida por la legislación aplicable.</p>
      <p>Si consideras que un menor nos ha proporcionado información personal de manera indebida, puedes comunicarte con nosotros para solicitar su revisión y eliminación cuando corresponda.</p>

      <h2>11. Enlaces a terceros</h2>
      <p>Nuestro sitio puede contener enlaces o referencias a sitios web y servicios de terceros.</p>
      <p>BombaLoot no controla las prácticas de privacidad de dichos terceros. Te recomendamos revisar sus respectivas políticas de privacidad antes de proporcionarles información personal.</p>

      <h2>12. Cambios en esta Política</h2>
      <p>Podemos actualizar esta Política de Privacidad cuando sea necesario para reflejar cambios en nuestros servicios, prácticas de tratamiento de datos o requisitos legales.</p>
      <p>La versión vigente estará siempre disponible en esta página.</p>
      <p>Cuando los cambios sean relevantes, podremos comunicarlo mediante los medios disponibles.</p>

      <h2>13. Contacto</h2>
      <p>Si tienes preguntas, solicitudes o inquietudes relacionadas con esta Política de Privacidad o con el tratamiento de tus datos personales, puedes comunicarte con BombaLoot mediante los canales de atención disponibles en nuestro sitio web.</p>

      <p className={styles.footnote}>
        Al utilizar BombaLoot, reconoces haber leído esta Política de Privacidad y comprender
        cómo tratamos la información personal de nuestros usuarios.
      </p>
    </div>
  );
}
