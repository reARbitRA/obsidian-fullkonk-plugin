// src/utils/uuid.ts
//
// `crypto.randomUUID()` is not guaranteed to exist in every Obsidian mobile
// WebView / older Electron combination, so we prefer it when available and
// fall back to a `Math.random`-based RFC 4122 v4 generator otherwise. This is
// only used for local, non-cryptographic message identifiers (React-key-like
// usage), never for anything security sensitive.
export function generateId(): string {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
    return globalCrypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
