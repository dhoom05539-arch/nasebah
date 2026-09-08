export const OWNER_EMAIL = "abdulrhmanbadwi@icloud.com";

export function isOwnerIdentity(email: string | null | undefined, openId: string, configuredOwnerOpenId: string) {
  return email?.toLowerCase() === OWNER_EMAIL || Boolean(configuredOwnerOpenId && openId === configuredOwnerOpenId);
}
