import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const DASHBOARD_USERNAME = "u85ll";
export const DASHBOARD_AUTH_VERSION = "database-v2";

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex || expectedHex.length !== 128) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
