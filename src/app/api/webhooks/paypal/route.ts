import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/server/db/client";
import { processPaypalWebhook } from "@/server/services/payment/webhook-service";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const transmissionId = request.headers.get("paypal-transmission-id");
  const transmissionTime = request.headers.get("paypal-transmission-time");
  const transmissionSig = request.headers.get("paypal-transmission-sig");
  const certUrl = request.headers.get("paypal-cert-url");
  const authAlgo = request.headers.get("paypal-auth-algo");

  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return NextResponse.json({ error: "Faltan headers de firma" }, { status: 401 });
  }

  try {
    const result = await processPaypalWebhook(getPool(), rawBody, {
      transmissionId,
      transmissionTime,
      transmissionSig,
      certUrl,
      authAlgo,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[webhook:paypal] error inesperado:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
