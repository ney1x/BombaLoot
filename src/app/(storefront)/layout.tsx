import type { Metadata } from "next";
import { Big_Shoulders, Public_Sans, Roboto_Mono } from "next/font/google";
import Script from "next/script";
import "../globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CartProvider } from "@/lib/cart-context";
import { SessionProvider } from "@/lib/session-context";

const THEME_INIT_SCRIPT = `
  try {
    var t = localStorage.getItem('loadout-theme');
    if (t === 'dark') document.documentElement.dataset.theme = 'dark';
  } catch (e) {}
`;

const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
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
  title: "bombaloot — recarga tu juego",
  description:
    "Códigos digitales de recarga para tus juegos favoritos, entregados apenas se confirma el pago.",
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
        <SessionProvider>
          <CartProvider>
            <Header />
            {children}
            <Footer />
          </CartProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
