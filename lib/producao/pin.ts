import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * PIN de 4 dígitos da produção.
 *
 * Ele não é a credencial — quem diz de quem é a mão é o login. O PIN é pedido
 * só no momento de concluir um pedido, para que um celular destravado no bolso
 * não marque produção e para que o registro tenha uma assinatura.
 *
 * scrypt com salt por pessoa. 4 dígitos são 10.000 combinações, então o custo
 * de derivação é a única coisa entre um vazamento da tabela e os PINs em claro.
 */

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const PREFIX = "scrypt";

export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && /^[0-9]{4}$/.test(pin);
}

/** PINs óbvios demais para servirem de assinatura. */
const PINS_FRACOS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888",
  "9999", "1234", "4321", "0123", "1230",
]);

export function isPinFraco(pin: string): boolean {
  return PINS_FRACOS.has(pin);
}

export function hashPin(pin: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const derived = scryptSync(pin, salt, KEY_LENGTH);
  return `${PREFIX}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algorithm, saltHex, hashHex] = stored.split("$");
  if (algorithm !== PREFIX || !saltHex || !hashHex) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }

  const derived = scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
