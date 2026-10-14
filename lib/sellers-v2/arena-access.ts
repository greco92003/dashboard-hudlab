// Quem treina na Arena. Módulo puro.

/**
 * Contas de teste que não treinam (além da conta do owner, a Hud Lab):
 * todo treino precisa pertencer a uma pessoa. Hoje não há nenhuma.
 */
export const TRAINING_BLOCKED_EMAILS: readonly string[] = [];

export function isTrainingBlocked(profile: { role?: string | null; email?: string | null } | null | undefined): boolean {
  if (!profile) return true;
  if (profile.role === "owner") return true;
  const email = profile.email?.trim().toLowerCase();
  return !!email && TRAINING_BLOCKED_EMAILS.includes(email);
}

export const TRAINING_BLOCKED_MESSAGE = "Esta conta não treina na Arena: entre com a sua conta pessoal para o treino contar para você.";
