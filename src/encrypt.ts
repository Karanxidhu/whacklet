import crypto from "crypto";

function deriveKey(secret: string) {
  if (!secret) throw new Error("ENCRYPTION_SECRET missing");
  return crypto.createHash("sha256").update(secret, "utf8").digest(); // 32 bytes
}

export function aesEncrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12); // 96-bit nonce for GCM

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const payload = Buffer.concat([iv, tag, ciphertext]);
  return payload.toString("base64");
}

export function aesDecrypt(payloadB64: string, secret: string): string {
  const key = deriveKey(secret);
  const payload = Buffer.from(payloadB64, "base64");

  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
