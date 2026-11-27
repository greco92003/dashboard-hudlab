// Quem administra o Hud Indica (vê a chave Pix, marca o Pix como pago e
// invalida indicação): owner, team-leader e a Amanda, dona do programa.
// Módulo puro.

/** A Amanda tem perfil "user" no dashboard; entra pela conta dela. */
export const HUD_INDICA_ADMIN_EMAILS: readonly string[] = ["amandahudlab@gmail.com"];

export function podeAdministrarHudIndica(role: string | null | undefined, email: string | null | undefined): boolean {
  if (role === "owner" || role === "team-leader") return true;
  const e = email?.trim().toLowerCase();
  return !!e && HUD_INDICA_ADMIN_EMAILS.includes(e);
}
