import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoVivo, estadoUbicaciones, type EspacioDoc } from "../lib/red/estado-ubicacion.ts";

const esp = (id: string, testigoMac: string, estado = "sin-verificar"): EspacioDoc =>
  ({ id, nombre: id, categoria: "sala", estado, testigoMac });

test("estadoVivo: sin testigo devuelve sin-testigo", () => {
  assert.equal(estadoVivo("", new Set(), new Set()), "sin-testigo");
});

test("estadoVivo: testigo presente es operativo, sin importar caso/separadores", () => {
  const presentes = new Set(["1c8341aabbcc"]);
  assert.equal(estadoVivo("1C:83:41:AA:BB:CC", presentes, presentes), "operativo");
  assert.equal(estadoVivo("1c-83-41-aa-bb-cc", presentes, presentes), "operativo");
});

test("estadoVivo: testigo que NetAlertX conoce pero no ve es sin-internet", () => {
  const conocidas = new Set(["1c8341aabbcc", "aaaaaaaaaaaa"]);
  assert.equal(estadoVivo("AA:AA:AA:AA:AA:AA", new Set(["1c8341aabbcc"]), conocidas), "sin-internet");
});

// "El AP se cayó" y "el AP ya no está en NetAlertX" mandan a buscar cosas
// distintas: la segunda manda a alguien a revisar un equipo que quizá se
// retiró, se archivó o cambió de MAC.
test("estadoVivo: testigo que NetAlertX ya no reporta es testigo-desconocido", () => {
  assert.equal(estadoVivo("AA:AA:AA:AA:AA:AA", new Set(["1c8341aabbcc"]), new Set(["1c8341aabbcc"])), "testigo-desconocido");
});

test("estadoUbicaciones cuenta por estado y normaliza las MAC vivas", () => {
  const espacios = [
    esp("esp:1", "1C:83:41:AA:BB:CC"),
    esp("esp:2", "aa:bb:cc:dd:ee:ff"),
    esp("esp:3", ""),
    esp("esp:4", "de:ad:be:ef:00:01"),
  ];
  const vivasPresentes = ["1c:83:41:aa:bb:cc"]; // solo el testigo de esp:1 está vivo
  const vivasConocidas = ["1c:83:41:aa:bb:cc", "AA:BB:CC:DD:EE:FF"]; // el de esp:4 ya no figura
  const { ubicaciones, resumen } = estadoUbicaciones(espacios, vivasPresentes, vivasConocidas);
  assert.deepEqual(ubicaciones.map((u) => u.estadoVivo), ["operativo", "sin-internet", "sin-testigo", "testigo-desconocido"]);
  assert.deepEqual(resumen, { operativo: 1, "sin-internet": 1, "sin-testigo": 1, "testigo-desconocido": 1 });
  assert.equal(ubicaciones[0].testigoPresente, true);
});
