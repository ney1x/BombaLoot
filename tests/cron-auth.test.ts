import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "@/server/http/cron-auth";

/**
 * Guarda de `/api/cron/*` (fase 8) — pura, sin DB. Protege contra que
 * cualquiera dispare el barrido/worker de reembolsos/conciliación
 * adivinando la URL.
 */

const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret-value";
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

function requestWithHeader(header: string | null): Request {
  const headers = new Headers();
  if (header) headers.set("authorization", header);
  return new Request("http://localhost:3000/api/cron/sweep", { headers });
}

function requestWithQuery(secret: string | null): Request {
  const url = new URL("http://localhost:3000/api/cron/sweep");
  if (secret !== null) url.searchParams.set("secret", secret);
  return new Request(url);
}

describe("isAuthorizedCronRequest", () => {
  it("sin CRON_SECRET configurada, nunca autoriza — ni con el header correcto", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCronRequest(requestWithHeader("Bearer test-cron-secret-value"))).toBe(false);
  });

  it("autoriza con el header Authorization: Bearer correcto", () => {
    expect(isAuthorizedCronRequest(requestWithHeader("Bearer test-cron-secret-value"))).toBe(true);
  });

  it("rechaza un Bearer incorrecto", () => {
    expect(isAuthorizedCronRequest(requestWithHeader("Bearer valor-equivocado"))).toBe(false);
  });

  it("autoriza con el query param ?secret= correcto (fallback)", () => {
    expect(isAuthorizedCronRequest(requestWithQuery("test-cron-secret-value"))).toBe(true);
  });

  it("rechaza un query param incorrecto", () => {
    expect(isAuthorizedCronRequest(requestWithQuery("valor-equivocado"))).toBe(false);
  });

  it("rechaza sin ninguna credencial", () => {
    expect(isAuthorizedCronRequest(requestWithHeader(null))).toBe(false);
  });

  it("rechaza un header que no es Bearer", () => {
    expect(isAuthorizedCronRequest(requestWithHeader("Basic dXNlcjpwYXNz"))).toBe(false);
  });
});
