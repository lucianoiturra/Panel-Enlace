import { test } from "node:test";
import assert from "node:assert/strict";
import { reconciliar, type CubiculoDoc, type DispositivoVivo } from "../lib/red/reconciliacion.ts";
import { vivoDeCubiculos } from "../lib/red/estado-cubiculo.ts";

const AHORA = Date.parse("2026-08-12T12:00:00.000Z");
const hace = (minutos: number) => new Date(AHORA - minutos * 60_000).toISOString();

const docs: CubiculoDoc[] = [
  { id: 1, ip: "192.168.1.101", mac: "1C-83-41-1C-7D-A1", status: "operational", marca: "Lenovo" },
  { id: 2, ip: "192.168.1.102", mac: "1C-83-41-1C-7D-A2", status: "operational", marca: "Lenovo" },
  { id: 3, ip: "", mac: "", status: "operational", marca: "Lenovo" },
  { id: 4, ip: "", mac: "", status: "no_computer", marca: "" },
];
const vivos: DispositivoVivo[] = [
  { mac: "1c:83:41:1c:7d:a1", ip: "192.168.1.101", nombre: "PC-01", fabricante: "Lenovo", ultimaConexion: "2026-08-12 11:58", presente: true },
  { mac: "1c:83:41:1c:7d:a2", ip: "192.168.1.212", nombre: "PC-02", fabricante: "Lenovo", ultimaConexion: "2026-08-12 11:57", presente: true },
];

test("el cruce coincide con reconciliar y trae la IP real", () => {
  const { porCubiculo, resumen, frescos } = vivoDeCubiculos(reconciliar(docs, vivos).cubiculos, hace(2), AHORA);
  assert.equal(frescos, true);
  assert.equal(porCubiculo.get(1)?.estado, "en-linea");
  assert.equal(porCubiculo.get(2)?.estado, "ip-distinta");
  assert.equal(porCubiculo.get(2)?.ipReal, "192.168.1.212");
  assert.equal(porCubiculo.get(1)?.nombreVivo, "PC-01");
  assert.equal(resumen?.["en-linea"], 1);
  assert.equal(resumen?.["ip-distinta"], 1);
});

// El modo de falla real: el sidecar deja mon_devices vacía o vieja. Sin este
// guardia, 38 cubículos se pintarían en rojo y mandarían a alguien a revisar
// una sala que está bien.
test("un volcado de más de 15 minutos no produce ningún estado vivo", () => {
  const { porCubiculo, resumen, frescos } = vivoDeCubiculos(reconciliar(docs, vivos).cubiculos, hace(16), AHORA);
  assert.equal(frescos, false);
  assert.equal(porCubiculo.size, 0);
  assert.equal(resumen, null);
});

test("sin marca de refresco tampoco hay estado vivo", () => {
  const { porCubiculo, resumen } = vivoDeCubiculos(reconciliar(docs, []).cubiculos, null, AHORA);
  assert.equal(porCubiculo.size, 0);
  assert.equal(resumen, null);
});

test("un cubículo sin MAC documentada nunca queda sin verse", () => {
  const { porCubiculo } = vivoDeCubiculos(reconciliar(docs, vivos).cubiculos, hace(1), AHORA);
  assert.equal(porCubiculo.get(3)?.estado, "sin-mac");
  assert.equal(porCubiculo.get(4)?.estado, "sin-computador");
});
