function getSecret() {
  const secret = process.env.PIN_ENCRYPTION_KEY;
  if (!secret) throw new Error("Falta configurar la clave segura para guardar PIN.");
  return secret;
}

async function getKey() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(getSecret()));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function encode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decode(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function encryptPin(pin: string) {
  if (!pin) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(), new TextEncoder().encode(pin));
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv); result.set(new Uint8Array(encrypted), iv.length);
  return encode(result);
}

export async function decryptPin(value: string) {
  if (!value) return "";
  try {
    const data = decode(value);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, await getKey(), data.slice(12));
    return new TextDecoder().decode(decrypted);
  } catch {
    return "";
  }
}
