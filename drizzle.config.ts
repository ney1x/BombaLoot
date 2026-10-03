import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // Las migraciones se escriben y revisan a mano: llevan índices parciales,
  // CHECK compuestos y un CONSTRAINT TRIGGER diferido que el generador no
  // produce por sí solo. `drizzle-kit generate` sirve para comparar, no para
  // sobrescribir.
  strict: true,
  verbose: true,
});
