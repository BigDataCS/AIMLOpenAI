/**
 * VaultMind crypto core.
 *
 * Envelope encryption:
 *   master passphrase --scrypt--> KEK (key-encryption key, never stored)
 *   per-document random DEK (data-encryption key) encrypts the blob with AES-256-GCM
 *   DEK is itself wrapped with the KEK (AES-256-GCM) and stored beside the ciphertext
 *
 * Rotating the master passphrase therefore only requires re-wrapping DEKs, not
 * re-encrypting every document. Each blob carries an auth tag, so any tampering
 * with ciphertext at rest is detected on read (integrity verification).
 */
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;
const SALT_LEN = 16;

export type WrappedKey = {
  /** base64 of the DEK encrypted under the KEK */
  ciphertext: string;
  iv: string;
  tag: string;
};

export type SealedBlob = {
  ciphertext: Buffer;
  iv: string;
  tag: string;
  /** sha-256 of the *plaintext*, used for dedupe + integrity proof */
  sha256: string;
  wrappedKey: WrappedKey;
};

/** Derive the KEK from the vault master passphrase. scrypt = memory-hard, GPU-resistant. */
export function deriveKek(passphrase: string, saltB64: string): Buffer {
  const salt = Buffer.from(saltB64, "base64");
  return crypto.scryptSync(passphrase, salt, KEY_LEN, { N: 16384, r: 8, p: 1 });
}

export function newSalt(): string {
  return crypto.randomBytes(SALT_LEN).toString("base64");
}

function encrypt(key: Buffer, plaintext: Buffer) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decrypt(key: Buffer, ciphertext: Buffer, ivB64: string, tagB64: string): Buffer {
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Encrypt a document blob under a fresh DEK, wrapping the DEK with the KEK. */
export function seal(kek: Buffer, plaintext: Buffer): SealedBlob {
  const dek = crypto.randomBytes(KEY_LEN);
  const body = encrypt(dek, plaintext);
  const wrapped = encrypt(kek, dek);
  return {
    ciphertext: body.ciphertext,
    iv: body.iv,
    tag: body.tag,
    sha256: crypto.createHash("sha256").update(plaintext).digest("hex"),
    wrappedKey: { ciphertext: wrapped.ciphertext.toString("base64"), iv: wrapped.iv, tag: wrapped.tag },
  };
}

/** Reverse of seal(). Throws if the ciphertext or the wrapped key was tampered with. */
export function open(kek: Buffer, blob: Omit<SealedBlob, "sha256">): Buffer {
  const dek = decrypt(kek, Buffer.from(blob.wrappedKey.ciphertext, "base64"), blob.wrappedKey.iv, blob.wrappedKey.tag);
  return decrypt(dek, blob.ciphertext, blob.iv, blob.tag);
}

/** Re-wrap a DEK under a new KEK — used by key rotation without touching blobs. */
export function rewrapKey(oldKek: Buffer, newKek: Buffer, wrapped: WrappedKey): WrappedKey {
  const dek = decrypt(oldKek, Buffer.from(wrapped.ciphertext, "base64"), wrapped.iv, wrapped.tag);
  const w = encrypt(newKek, dek);
  return { ciphertext: w.ciphertext.toString("base64"), iv: w.iv, tag: w.tag };
}

export function sha256(buf: Buffer | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Tamper-evident audit chain: each entry commits to the hash of the previous one. */
export function chainHash(prevHash: string, payload: string): string {
  return crypto.createHash("sha256").update(prevHash + "|" + payload).digest("hex");
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Hash a share-link password so we never store it in the clear. */
export function hashSecret(secret: string, saltB64: string): string {
  return crypto.scryptSync(secret, Buffer.from(saltB64, "base64"), 32).toString("base64");
}
