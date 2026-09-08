import { createHash } from "node:crypto";

export function hashLinkCode(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function isLinkCodeActive(codeHash: string, savedHash: string | null, expiresAt: Date | null, now = Date.now()) {
  return Boolean(savedHash && expiresAt && savedHash === codeHash && expiresAt.getTime() > now);
}
