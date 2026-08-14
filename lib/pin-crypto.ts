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

// Devolver "" ante un fallo hacía que un PIN ilegible se viera igual que un
// cubículo sin PIN: la ficha decía "Configurado" con el campo en blanco, sin
// aviso, y la validación de 4-64 caracteres impedía guardarlo. El resultado va
// discriminado para que quien lo lea tenga que decidir qué hacer con el fallo.
export type PinDescifrado = { ok: true; pin: string } | { ok: false };

export async function decryptPin(value: string): Promise<PinDescifrado> {
  if (!value) return { ok: true, pin: "" };
  try {
    const data = decode(value);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, await getKey(), data.slice(12));
    return { ok: true, pin: new TextDecoder().decode(decrypted) };
  } catch {
    return { ok: false };
  }
}
