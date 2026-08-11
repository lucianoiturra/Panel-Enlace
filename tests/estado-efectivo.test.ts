import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarEstadoVivo, datosFrescos, estadoEfectivo, MINUTOS_FRESCURA } from "../lib/red/estado-efectivo.ts";
import type { EspacioVivo } from "../lib/red/estado-ubicacion.ts";
import type { Espacio } from "../lib/red/modelo.ts";
import { fixture } from "./fixture-red.ts";

const espacio = (id: string, estado: Espacio["estado"], testigoMac = ""): Espacio =>
  ({ id, nombre: id, ubicacion: "", categoria: "sala", estado, x: 0, y: 0, nota: "", testigoMac });

const vivo = (id: string, estadoVivo: EspacioVivo["estadoVivo"], testigoMac = ""): EspacioVivo =>
  ({ id, nombre: id, categoria: "sala", estadoManual: "sin-verificar", testigoMac, estadoVivo, testigoPresente: estadoVivo === "operativo" });

test("sin testigo se queda con el estado manual", () => {
  const salida = estadoEfectivo(espacio("esp:1", "solo-wifi"), vivo("esp:1", "sin-testigo"), true);
  assert.equal(salida.estado, "solo-wifi");
  assert.equal(salida.origen, "manual");
  assert.equal(salida.testigoPresente, false);
});

test("testigo presente manda: operativo y origen auto", () => {
  const salida = estadoEfectivo(espacio("esp:1", "sin-verificar", "1c:83:41:aa:bb:cc"), vivo("esp:1", "operativo", "1c:83:41:aa:bb:cc"), true);
  assert.equal(salida.estado, "operativo");
  assert.equal(salida.origen, "auto");
  assert.equal(salida.testigoPresente, true);
});

test("testigo ausente es sin-internet, y el manual queda guardado aparte", () => {
  const salida = estadoEfectivo(espacio("esp:1", "solo-wifi", "1c:83:41:aa:bb:cc"), vivo("esp:1", "sin-internet", "1c:83:41:aa:bb:cc"), true);
  assert.equal(salida.estado, "sin-internet");
  assert.equal(salida.origen, "auto");
  assert.equal(salida.estadoManual, "solo-wifi");
});

// El sidecar panel-mon-export puede morir sin ruido. Sin este guardia, RED
// pintaría 21 salas "sin internet" que están perfectas.
test("con datos viejos no se inventa nada: vuelve al manual", () => {
  const salida = estadoEfectivo(espacio("esp:1", "operativo", "1c:83:41:aa:bb:cc"), vivo("esp:1", "sin-internet", "1c:83:41:aa:bb:cc"), false);
  assert.equal(salida.estado, "operativo");
  assert.equal(salida.origen, "manual");
});

test("un espacio sin fila viva se queda manual", () => {
  const salida = estadoEfectivo(espacio("esp:1", "sin-verificar", "1c:83:41:aa:bb:cc"), undefined, true);
  assert.equal(salida.estado, "sin-verificar");
  assert.equal(salida.origen, "manual");
});

test("datosFrescos mide contra el umbral y rechaza basura", () => {
  const ahora = Date.parse("2026-08-11T12:00:00Z");
  const hace = (minutos: number) => new Date(ahora - minutos * 60_000).toISOString();
  assert.equal(datosFrescos(hace(MINUTOS_FRESCURA - 1), ahora), true);
  assert.equal(datosFrescos(hace(MINUTOS_FRESCURA + 1), ahora), false);
  assert.equal(datosFrescos(null, ahora), false);
  assert.equal(datosFrescos("no es una fecha", ahora), false);
});

test("aplicarEstadoVivo conserva el resto del EstadoRed intacto", () => {
  const red = fixture();
  const vivos: EspacioVivo[] = [vivo("esp:secretaria", "sin-internet", "1c:83:41:aa:bb:cc")];
  const salida = aplicarEstadoVivo(red, vivos, true);
  assert.equal(salida.espacios.length, red.espacios.length);
  assert.equal(salida.espacios.find(item => item.id === "esp:secretaria")?.estado, "sin-internet");
  assert.equal(salida.espacios.find(item => item.id === "esp:3-basico-b")?.origen, "manual");
  assert.deepEqual(salida.enlaces, red.enlaces);
  assert.deepEqual(salida.puertos, red.puertos);
});
