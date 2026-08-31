/**
 * CLI de base de datos.
 *
 *   npm run db:migrate     aplica migraciones pendientes
 *   npm run db:seed        siembra catálogo y códigos de desarrollo
 *   npm run db:reset       borra todo y vuelve a migrar + sembrar
 *   npm run db:sweep       corre el barrido de reservas vencidas (mantenimiento)
 *   npm run db:refund-worker   procesa un lote de refund_requests pendientes (fase 5)
 *   npm run db:reconcile-payments   sincroniza payment_intents atascados en INITIATED (fase 8)
 */

import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });

const command = process.argv[2];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta ${name}. Copiá .env.example a .env.local y completalo.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const pool = new Pool({ connectionString: requireEnv("DATABASE_URL") });

  try {
    switch (command) {
      case "migrate": {
        const { runMigrations } = await import("../src/server/db/migrate");
        const applied = await runMigrations(pool);
        console.log(
          applied.length > 0
            ? `Migraciones aplicadas:\n  ${applied.join("\n  ")}`
            : "Sin migraciones pendientes.",
        );
        break;
      }

      case "seed": {
        requireEnv("CODE_ENCRYPTION_KEY");
        requireEnv("CODE_FINGERPRINT_KEY");
        const { seed } = await import("../src/server/db/seed");
        const result = await seed(pool);
        console.log(
          `Semilla lista: ${result.games} juegos · ${result.products} productos · ` +
            `${result.tiers} niveles · ${result.codes} códigos nuevos`,
        );
        break;
      }

      case "reset": {
        await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
        const { runMigrations } = await import("../src/server/db/migrate");
        await runMigrations(pool);
        requireEnv("CODE_ENCRYPTION_KEY");
        requireEnv("CODE_FINGERPRINT_KEY");
        const { seed } = await import("../src/server/db/seed");
        const result = await seed(pool);
        console.log(`Base recreada. ${result.codes} códigos sembrados.`);
        break;
      }

      case "sweep": {
        const { createDb } = await import("../src/server/db/client");
        const { sweepExpiredReservations } = await import("../src/server/services/inventory");
        const { sweepExpiredPendingOrders } = await import("../src/server/services/checkout-service");

        const reservations = await sweepExpiredReservations(createDb(pool));
        console.log(
          `Reservas: ${reservations.codesReleased} código(s) liberado(s), ` +
            `${reservations.reservationsExpired} reserva(s) marcada(s) EXPIRED.`,
        );

        const orders = await sweepExpiredPendingOrders(pool);
        console.log(
          `Pedidos: ${orders.ordersExpired} pedido(s) marcado(s) FAILED por ventana de pago vencida, ` +
            `${orders.codesReleased} código(s) liberado(s).`,
        );
        break;
      }

      case "refund-worker": {
        const { runRefundWorkerBatch } = await import("../src/server/services/payment/refund-service");
        const { processed } = await runRefundWorkerBatch(pool);
        console.log(`Reembolsos procesados en este lote: ${processed}.`);
        break;
      }

      case "reconcile-payments": {
        const { runReconciliationBatch } = await import("../src/server/services/payment/reconciliation-service");
        const { checked, synced, errors } = await runReconciliationBatch(pool);
        console.log(
          `Conciliación: ${checked} intent(s) revisado(s), ${synced} sincronizado(s), ${errors} error(es).`,
        );
        break;
      }

      default:
        console.error("Uso: tsx scripts/db.ts <migrate|seed|reset|sweep|refund-worker|reconcile-payments>");
        process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
