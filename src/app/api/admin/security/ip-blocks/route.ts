import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminOrSupportApi } from "@/server/auth/guards";
import { getDb, getPool } from "@/server/db/client";
import { requestMeta } from "@/server/http/request-meta";
import { apiErrorToResponse } from "@/server/http/respond";
import { blockIp, listBlockedIps } from "@/server/services/security-service";

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_RE =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;

/**
 * `assertIpNotBlocked` hace `WHERE ip = <valor exacto>` — no interpreta
 * rangos. Aceptar CIDR acá daría al admin la falsa sensación de estar
 * bloqueando un rango cuando en realidad no bloquea nada. Se rechaza
 * explícito en vez de aceptarlo silenciosamente y no hacer nada.
 */
const blockSchema = z.object({
  ip: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .refine((v) => !v.includes("/"), {
      message: "No se admiten rangos CIDR acá — el bloqueo es por IP exacta, un rango no funcionaría.",
    })
    .refine((v) => IPV4_RE.test(v) || IPV6_RE.test(v), {
      message: "Eso no es una IPv4 o IPv6 válida.",
    }),
  reason: z.string().trim().min(5, "Contá brevemente por qué (mínimo 5 caracteres)").max(500),
});

export async function GET() {
  try {
    await requireAdminOrSupportApi();
    const blocks = await listBlockedIps(getDb());
    return NextResponse.json({ blocks });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminOrSupportApi();
    const { ip, reason } = blockSchema.parse(await request.json());
    await blockIp(getPool(), actor, ip, reason, requestMeta(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorToResponse(error);
  }
}
