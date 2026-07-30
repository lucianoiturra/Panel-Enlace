import { test } from "node:test";
import assert from "node:assert/strict";
import semilla from "../lib/red/semilla.json" with { type: "json" };
import { agruparEnlaces, aristasParaDibujar, nodoDeExtremo } from "../lib/red/aristas.ts";
import type { EstadoRed } from "../lib/red/modelo.ts";

const real = (): EstadoRed => ({ ...semilla, bitacora: [], cubiculos: [] } as unknown as EstadoRed);

test("nodoDeExtremo lleva un puerto a su equipo y respeta los aparatos de un puerto", () => {
  const estado = real();
  assert.equal(nodoDeExtremo(estado, "pto:R2-PP1-p19"), "eq:R2-PP1");
  assert.equal(nodoDeExtremo(estado, "pto:ISP-p0"), "pto:ISP-p0");
  assert.equal(nodoDeExtremo(estado, "esp:utp-e-basica"), "esp:utp-e-basica");
});

test("los 98 enlaces de la semilla se agregan a 16 pares", () => {
  const aristas = agruparEnlaces(real());
  assert.equal(aristas.length, 16);
  assert.equal(real().enlaces.length, 98);
});

test("el par R2/SW3 con R2/PP3 lleva la cuenta de sus 24 patcheos", () => {
  const par = agruparEnlaces(real()).find(arista => arista.clave === "eq:R2-PP3|eq:R2-SW3");
  assert.ok(par, "el par existe con la clave ordenada alfabéticamente");
  assert.equal(par.cuenta, 24);
  assert.equal(par.tipo, "patch");
});

test("un par con tipos mezclados se queda con el más pesado", () => {
  const estado = real();
  estado.enlaces = [
    { id: 1, a: "pto:R2-SW1-p1", b: "pto:R2-PP1-p1", tipo: "patch", nota: "" },
    { id: 2, a: "pto:R2-SW1-p2", b: "pto:R2-PP1-p2", tipo: "uplink", nota: "" },
  ];
  const [par] = agruparEnlaces(estado);
  assert.equal(par.cuenta, 2);
  assert.equal(par.tipo, "uplink");
});

test("sin nada abierto se dibujan las 16 aristas agregadas", () => {
  assert.equal(aristasParaDibujar(real(), new Set()).length, 16);
});

test("con las dos puntas abiertas el par se desagrega en sus 24 enlaces", () => {
  const aristas = aristasParaDibujar(real(), new Set(["eq:R2-SW3", "eq:R2-PP3"]));
  const sueltas = aristas.filter(arista => arista.a.startsWith("pto:R2-") && arista.cuenta === 1
    && [arista.a, arista.b].some(punta => punta.includes("PP3")));
  assert.equal(sueltas.length, 24);
  assert.equal(aristas.some(arista => arista.clave === "eq:R2-PP3|eq:R2-SW3"), false);
  assert.equal(aristas.length, 16 - 1 + 24);
});

test("con una sola punta abierta el par sigue agregado", () => {
  const aristas = aristasParaDibujar(real(), new Set(["eq:R2-SW3"]));
  const par = aristas.find(arista => arista.clave === "eq:R2-PP3|eq:R2-SW3");
  assert.equal(par?.cuenta, 24);
});

test("un destino no tiene rejilla, así que basta con abrir el panel", () => {
  const aristas = aristasParaDibujar(real(), new Set(["eq:R2-PP1"]));
  const roseta = aristas.find(arista => arista.a === "esp:utp-e-basica" || arista.b === "esp:utp-e-basica");
  assert.ok(roseta);
  assert.equal(roseta.cuenta, 1);
  assert.equal([roseta.a, roseta.b].includes("pto:R2-PP1-p19"), true);
});
