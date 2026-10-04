import type { MetadataRoute } from "next";

// Permite instalar Smart Account en el celular ("Agregar a pantalla de inicio"): abre a pantalla completa, con su ícono.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smart Account",
    short_name: "Smart Account",
    description: "Control de finanzas personales",
    lang: "es-MX",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f4ef",
    theme_color: "#1f3a5f",
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Registrar un pago", url: "/transacciones", icons: [{ src: "/icono-192.png", sizes: "192x192" }] },
      { name: "Programar un pago", url: "/pagos-programados?nuevo=1", icons: [{ src: "/icono-192.png", sizes: "192x192" }] },
    ],
  };
}
