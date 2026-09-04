import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    `SELECT o.id, o.buyer_name, o.buyer_legal_id, o.buyer_phone, o.email
       FROM orders o
       JOIN payment_intents pi ON pi.order_id = o.id
      WHERE pi.id = $1`,
    ["2d073f24-757c-4175-a256-6f2ba04bd469"],
  );
  console.log(JSON.stringify(rows, null, 2));
  await pool.end();
}

main();
