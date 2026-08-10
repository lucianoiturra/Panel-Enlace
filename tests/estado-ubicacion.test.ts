import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoVivo, estadoUbicaciones, type EspacioDoc } from "../lib/red/estado-ubicacion.ts";

const esp = (id: string, testigoMac: string, estado = "sin-verificar"): EspacioDoc =>
  ({ id, nombre: id, categoria: "sala", estado, testigoMac });

test("estadoVivo: sin testigo devuelve sin-testigo", () => {
  assert.equal(estadoVivo("", new Set()), "sin-testigo");
});

test("estadoVivo: testigo presente es operativo, sin importar caso/separadores", () => {
  const presentes = new Set(["1c8341aabbcc"]);
  assert.equal(estadoVivo("1C:83:41:AA:BB:CC", presentes), "operativo");
  assert.equal(estadoVivo("1c-83-41-aa-bb-cc", presentes), "operativo");
});

test("estadoVivo: testigo ausente es sin-internet", () => {
  assert.equal(estadoVivo("AA:AA:AA:AA:AA:AA", new Set(["1c8341aabbcc"])), "sin-internet");
});

test("estadoUbicaciones cuenta por estado y normaliza las MAC vivas", () => {
  const espacios = [
    esp("esp:1", "1C:83:41:AA:BB:CC"),
    esp("esp:2", "aa:bb:cc:dd:ee:ff"),
    esp("esp:3", ""),
  ];
  const vivasPresentes = ["1c:83:41:aa:bb:cc"]; // solo el testigo de esp:1 está vivo
  const { ubicaciones, resumen } = estadoUbicaciones(espacios, vivasPresentes);
  assert.deepEqual(ubicaciones.map((u) => u.estadoVivo), ["operativo", "sin-internet", "sin-testigo"]);
  assert.deepEqual(resumen, { operativo: 1, "sin-internet": 1, "sin-testigo": 1 });
  assert.equal(ubicaciones[0].testigoPresente, true);
});
