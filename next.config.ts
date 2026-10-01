import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen y letra para el aviso de pago (se leen del disco al generar la imagen)
  outputFileTracingIncludes: {
    "/**": ["./src/assets/**"],
  },
};

export default nextConfig;
