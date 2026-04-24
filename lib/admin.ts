// Single source of truth for which account is allowed to view the admin
// dashboard. Compared case-insensitively at every gate.
export const ADMIN_EMAIL = "jack@soundbitemanagement.com";

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
