// Convert raw key string (from URL) to CryptoKey
export const importKey = async (rawKey: string): Promise<CryptoKey> => {
  const binaryString = atob(rawKey);
  const keyBuffer = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    keyBuffer[i] = binaryString.charCodeAt(i);
  }
  return window.crypto.subtle.importKey(
    "raw", keyBuffer, "AES-GCM", true, ["encrypt", "decrypt"]
  );
};

// Generate a new random key and return as Base64 string
export const generateKey = async (): Promise<string> => {
  const key = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
  );
  const exported = await window.crypto.subtle.exportKey("raw", key);
  const exportedBytes = new Uint8Array(exported);
  const binaryString = Array.from(exportedBytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binaryString);
};

export const encryptData = async (key: CryptoKey, data: Uint8Array): Promise<Uint8Array> => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Random IV
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, data
  );

  // Pack IV + Ciphertext together
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encrypted), iv.length);
  return result;
};

export const decryptData = async (key: CryptoKey, data: Uint8Array): Promise<Uint8Array> => {
  const iv = data.slice(0, 12); // Extract IV
  const ciphertext = data.slice(12);

  return new Uint8Array(await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv }, key, ciphertext
  ));
};

// Vault key management for device pairing
export const generateVaultKey = async (): Promise<string> => {
  return generateKey();
};

export const hashVaultKeyToPath = async (vaultKeyBase64: string): Promise<string> => {
  const binaryString = atob(vaultKeyBase64);
  const keyBuffer = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    keyBuffer[i] = binaryString.charCodeAt(i);
  }
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", keyBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray, (byte) => byte.toString(16).padStart(2, "0")).join("");
};
