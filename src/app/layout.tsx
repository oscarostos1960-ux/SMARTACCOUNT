import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
import "./globals.css";


// Manrope (tipografía del diseño), incluida en el proyecto para no depender de servicios externos
const manrope = localFont({ src: "./fonts/Manrope-latin.woff2", variable: "--font-manrope", weight: "200 800", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Smart Account", template: "%s · Smart Account" },
  description: "Control de finanzas personales",
  applicationName: "Smart Account",
  // En iPhone: al agregarla a la pantalla de inicio abre como app, sin la barra de Safari
  appleWebApp: { capable: true, title: "Smart Account", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#1f3a5f", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className={`${manrope.variable} ${GeistSans.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
