import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";


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
    <html lang="es-MX" className={`${GeistSans.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
