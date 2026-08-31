import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: ".env.local" });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Bajo Next, `server-only` se resuelve a un módulo vacío por la condición
      // "react-server". Vitest corre en Node plano, donde el paquete lanza a
      // propósito, así que lo neutralizamos acá.
      "server-only": path.resolve(__dirname, "tests/helpers/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Los tests comparten una base de datos: nunca en paralelo entre archivos.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    reporters: ["verbose"],
  },
});
