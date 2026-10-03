import type { Metadata } from "next";
import { Suspense } from "react";
import { Big_Shoulders, Public_Sans, Roboto_Mono } from "next/font/google";
import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "../globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AssistantLauncher } from "@/components/AssistantLauncher";
import { NavigationProgress } from "@/components/NavigationProgress";
import { CartProvider } from "@/lib/cart-context";
import { SessionProvider } from "@/lib/session-context";
import { pageMetadata } from "@/lib/seo";

const THEME_INIT_SCRIPT = `
  try {
    var t = localStorage.getItem('loadout-theme');
    if (t === 'light') document.documentElement.dataset.theme = 'light';
    else document.documentElement.dataset.theme = 'dark';
  } catch (e) {}
`;

const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  // `next build` avisa "Failed to find font override values for font `Big
  // Shoulders` — Skipping generating a fallback font": Next no tiene
  // métricas de esta fuente en su base interna, así que el ajuste
  // automático de CLS (`adjustFontFallback`, que si funciona no hace
  // falta tocar nada acá) no puede correr para esta en particular — las
  // otras dos (Public Sans, Roboto Mono) no tiran el aviso, sí lo tienen.
  // Declarar un fallback explícito (una condensada real del sistema, ya
  // que Big Shoulders también lo es) es lo que queda disponible sin ese
  // ajuste automático — no elimina el salto de layout al cambiar de
  // fuente, lo reduce frente a caer en el fallback genérico default.
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  ...pageMetadata({
    title: "BombaLoot — recarga tu juego",
    description:
      "Códigos digitales de recarga para tus juegos favoritos, entregados apenas se confirma el pago.",
    path: "/",
  }),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${bigShoulders.variable} ${publicSans.variable} ${robotoMono.variable}`}
    >
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        {/* `useSearchParams()` adentro exige un boundary propio — si no, de-optimiza a client-side rendering el árbol entero hasta acá (ver docs de `useSearchParams`). El fallback es `null`: el estado inicial de la barra ya es invisible (width:0/opacity:0), así que no hay nada que mostrar antes de hidratar. */}
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <SessionProvider>
          <CartProvider>
            <Header />
            <div className="siteMain">{children}</div>
            <Footer />
            <AssistantLauncher />
          </CartProvider>
        </SessionProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
