import { cookieOptionsForEnv } from "@/server/auth/cookies";

export function baseCookieOptionsForTest(nodeEnv: "development" | "production") {
  return cookieOptionsForEnv(nodeEnv);
}
