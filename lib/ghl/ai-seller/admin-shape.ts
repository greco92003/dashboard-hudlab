// Quem administra a Cami: Controle (inclui promoção), aprovar o anexo,
// marcar revisado e dar feedback. A conta dono (owner) e as contas abaixo.
// Módulo puro.

/** Contas que administram a Cami além do owner (decisão do dono em 16/10). */
export const CAMI_ADMIN_EMAILS: readonly string[] = ["willianwmw@gmail.com"];

export function isCamiAdmin(role: string | null | undefined, email: string | null | undefined): boolean {
  if (role === "owner") return true;
  const e = email?.trim().toLowerCase();
  return !!e && CAMI_ADMIN_EMAILS.includes(e);
}
