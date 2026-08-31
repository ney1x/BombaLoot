import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/server/db/client";
import { processWompiWebhook } from "@/server/services/payment/webhook-service";

/**
 * Único punto de entrada de eventos de Wompi. Nunca confía en el body sin
 * verificar la firma primero — `processWompiWebhook` registra CADA intento
 * (recibido, firma inválida, duplicado, huérfano, procesado, error) en
 * `payment_events` antes de decidir qué responder.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  try {
    const result = await processWompiWebhook(getPool(), rawBody);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    // Error inesperado (DB caída a mitad de la transacción, etc): 500 para
    // que Wompi reintente — la idempotencia de `payment_events` hace que
    // reintentar sea seguro.
    console.error("[webhook:wompi] error inesperado:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
