import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarMac, reconciliar, type CubiculoDoc, type DispositivoVivo } from "../lib/red/reconciliacion.ts";

const cub = (id: number, mac: string, ip = "", status = "operational"): CubiculoDoc =>
  ({ id, mac, ip, status, marca: "" });
const vivo = (mac: string, ip: string, presente = true): DispositivoVivo =>
  ({ mac, ip, nombre: "", fabricante: "", ultimaConexion: "", presente });

test("normalizarMac ignora mayúsculas y separadores", () => {
  assert.equal(normalizarMac("1C:83:41:AA:BB:CC"), "1c8341aabbcc");
  assert.equal(normalizarMac("1c-83-41-aa-bb-cc"), "1c8341aabbcc");
  assert.equal(normalizarMac(""), "");
});

test("documentado y presente con misma IP queda en-linea", () => {
  const r = reconciliar([cub(1, "1C:83:41:AA:BB:CC", "192.168.1.10")], [vivo("1c:83:41:aa:bb:cc", "192.168.1.10")]);
  assert.equal(r.cubiculos[0].estado, "en-linea");
  assert.equal(r.resumen.enLinea, 1);
});

test("misma MAC pero IP distinta marca ip-distinta y expone la IP real", () => {
  const r = reconciliar([cub(1, "1C:83:41:AA:BB:CC", "192.168.1.10")], [vivo("1c:83:41:aa:bb:cc", "192.168.1.55")]);
  assert.equal(r.cubiculos[0].estado, "ip-distinta");
  assert.equal(r.cubiculos[0].ipReal, "192.168.1.55");
});

test("documentado pero ausente o no presente queda sin-verse", () => {
  const ausente = reconciliar([cub(1, "AA:AA:AA:AA:AA:AA")], []);
  assert.equal(ausente.cubiculos[0].estado, "sin-verse");
  const offline = reconciliar([cub(1, "AA:AA:AA:AA:AA:AA")], [vivo("aa:aa:aa:aa:aa:aa", "192.168.1.9", false)]);
  assert.equal(offline.cubiculos[0].estado, "sin-verse");
});

test("cubículo sin MAC documentada queda sin-mac", () => {
  const r = reconciliar([cub(1, "")], [vivo("11:22:33:44:55:66", "192.168.1.3")]);
  assert.equal(r.cubiculos[0].estado, "sin-mac");
});

test("cubículo marcado no_computer queda sin-computador aunque su MAC esté viva", () => {
  const r = reconciliar([cub(1, "AA:AA:AA:AA:AA:AA", "", "no_computer")], [vivo("aa:aa:aa:aa:aa:aa", "192.168.1.9")]);
  assert.equal(r.cubiculos[0].estado, "sin-computador");
});

test("equipo vivo con MAC no documentada aparece en sinDocumentar, presentes primero", () => {
  const r = reconciliar(
    [cub(1, "AA:AA:AA:AA:AA:AA", "192.168.1.10")],
    [
      vivo("aa:aa:aa:aa:aa:aa", "192.168.1.10"),
      vivo("bb:bb:bb:bb:bb:bb", "192.168.1.20", false),
      vivo("cc:cc:cc:cc:cc:cc", "192.168.1.30", true),
    ],
  );
  assert.deepEqual(r.sinDocumentar.map((d) => d.mac), ["cc:cc:cc:cc:cc:cc", "bb:bb:bb:bb:bb:bb"]);
  assert.equal(r.resumen.sinDocumentar, 2);
});
