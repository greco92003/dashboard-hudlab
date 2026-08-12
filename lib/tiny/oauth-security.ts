import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const OAUTH_FLOW_MAX_AGE_MS = 10 * 60 * 1000;

type OAuthStatePayload = {
  version: 1;
  userId: string;
  nonce: string;
  issuedAt: number;
};

function requireStateSecret(): string {
  const secret = process.env.TINY_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("Tiny OAuth state protection is not configured");
  return secret;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", requireStateSecret())
    .update(encodedPayload, "utf8")
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createTinyOAuthFlow(userId: string): {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  const nonce = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(64).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier, "ascii")
    .digest("base64url");
  const payload: OAuthStatePayload = {
    version: 1,
    userId,
    nonce,
    issuedAt: Date.now(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );

  return {
    state: `${encodedPayload}.${sign(encodedPayload)}`,
    nonce,
    codeVerifier,
    codeChallenge,
  };
}

export function verifyTinyOAuthState(input: {
  state: string | null;
  expectedUserId: string;
  expectedNonce: string | undefined;
  nowMs?: number;
}): boolean {
  if (!input.state || !input.expectedNonce) return false;
  const [encodedPayload, receivedSignature, extra] = input.state.split(".");
  if (!encodedPayload || !receivedSignature || extra) return false;
  if (!safeEqual(receivedSignature, sign(encodedPayload))) return false;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
    const nowMs = input.nowMs ?? Date.now();
    return (
      payload.version === 1 &&
      payload.userId === input.expectedUserId &&
      safeEqual(payload.nonce, input.expectedNonce) &&
      Number.isFinite(payload.issuedAt) &&
      nowMs >= payload.issuedAt &&
      nowMs - payload.issuedAt <= OAUTH_FLOW_MAX_AGE_MS
    );
  } catch {
    return false;
  }
}
