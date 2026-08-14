import { timingSafeEqual } from "node:crypto";

// Se decide aparte de proxy.ts porque `next/server` no resuelve desde `node`
// pelado: dejar el juicio acá es lo que permite probarlo con node --test, y es
// la misma convención que el resto de lib/.
export type Acceso = "sin-configurar" | "adelante" | "rechazado";

function coincide(recibido: string, esperado: string) {
  const bytesRecibidos = Buffer.from(recibido);
  const bytesEsperados = Buffer.from(esperado);
  // timingSafeEqual lanza si los buffers miden distinto, así que el largo se
  // mira antes. Que el largo se filtre no importa: ya lo delata la cabecera.
  return bytesRecibidos.length === bytesEsperados.length && timingSafeEqual(bytesRecibidos, bytesEsperados);
}

export function decidirAcceso(
  autorizacion: string | null | undefined,
  usuario: string | undefined,
  clave: string | undefined,
): Acceso {
  // Una variable vacía es "existe pero no dice nada": darla por configurada
  // dejaría entrar con usuario y clave en blanco.
  if (!usuario || !clave) return "sin-configurar";
  const esperado = `Basic ${Buffer.from(`${usuario}:${clave}`).toString("base64")}`;
  return coincide(autorizacion ?? "", esperado) ? "adelante" : "rechazado";
}
