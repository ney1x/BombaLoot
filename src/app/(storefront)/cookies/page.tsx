import Link from "next/link";
import styles from "../legal.module.css";
import { Breadcrumb } from "@/components/Breadcrumb";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Política de Cookies | BombaLoot",
  description: "Qué cookies usa BombaLoot y para qué — solo cookies propias, necesarias para el funcionamiento del sitio.",
  path: "/cookies",
});

export default function CookiesPage() {
  return (
    <div className={styles.wrap}>
      <Breadcrumb items={[{ name: "Home", path: "" }, { name: "Política de Cookies", path: "/cookies" }]} />
      <h1>Política de Cookies</h1>
      <p className={styles.intro}>
        Esta Política de Cookies explica qué cookies y tecnologías similares utiliza BombaLoot,
        para qué las usamos y cómo puedes controlarlas.
      </p>

      <h2>1. ¿Qué es una cookie?</h2>
      <p>
        Una cookie es un pequeño archivo que un sitio web guarda en tu navegador para recordar
        información entre visitas o durante tu navegación, como mantener tu sesión iniciada o el
        contenido de tu carrito.
      </p>

      <h2>2. Cookies que utilizamos</h2>
      <p>BombaLoot utiliza únicamente cookies propias, necesarias para el funcionamiento del sitio:</p>
      <ul>
        <li>
          <strong>loadout_session</strong> — mantiene tu sesión iniciada al acceder a tu cuenta.
          Es de tipo <em>httpOnly</em> (no puede leerse desde JavaScript) y viaja solo por
          conexiones seguras en producción. Si activas &quot;Recordarme&quot; se conserva por un
          tiempo limitado; de lo contrario se borra al cerrar el navegador.
        </li>
        <li>
          <strong>loadout_claim</strong> — cookie temporal (dura 30 minutos) que permite asociar
          un pedido realizado como invitado con tu cuenta al momento de registrarte.
        </li>
      </ul>
      <p>
        Ambas son estrictamente necesarias para el funcionamiento de la tienda y no pueden
        desactivarse sin afectar el uso del sitio (por ejemplo, no podrías mantener sesión
        iniciada).
      </p>

      <h2>3. Almacenamiento local del navegador</h2>
      <p>
        Además de cookies, BombaLoot guarda cierta información directamente en tu navegador
        mediante <em>localStorage</em>, una tecnología similar que no se envía a nuestros
        servidores:
      </p>
      <ul>
        <li>Contenido de tu carrito de compras, para que no se pierda al recargar la página.</li>
        <li>Preferencia de tema claro u oscuro.</li>
        <li>Datos de pedidos realizados como invitado (sin cuenta), para que puedas consultarlos luego.</li>
        <li>
          El enlace de acceso a tus conversaciones de soporte abiertas como invitado (sin cuenta),
          para que <Link href="/ayuda">Ayuda</Link> pueda ofrecerte volver a ellas sin tener que
          guardar el link a mano. El acceso real a la conversación lo da el enlace en sí (un token
          único que se genera al crear la solicitud), no este dato guardado localmente — es solo
          un acceso directo.
        </li>
      </ul>

      <h2>4. Cookies de terceros</h2>
      <p>
        BombaLoot no utiliza cookies de publicidad ni de seguimiento (tracking) de terceros. Los
        proveedores de pago utilizados durante el checkout pueden establecer sus propias cookies
        conforme a sus políticas, ajenas a BombaLoot.
      </p>

      <h2>5. Cómo controlar las cookies</h2>
      <p>
        Puedes eliminar o bloquear las cookies desde la configuración de tu navegador en cualquier
        momento. Ten en cuenta que bloquear las cookies necesarias descritas arriba puede impedir
        que puedas iniciar sesión o completar compras correctamente.
      </p>

      <h2>6. Cambios en esta Política</h2>
      <p>
        Podemos actualizar esta Política de Cookies cuando sea necesario. La versión vigente
        estará siempre disponible en esta página.
      </p>

      <h2>7. Contacto</h2>
      <p>
        Si tienes preguntas sobre el uso de cookies en BombaLoot, puedes comunicarte con nosotros
        mediante los canales de atención disponibles en nuestro sitio web.
      </p>
    </div>
  );
}
