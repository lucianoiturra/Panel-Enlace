import assert from "node:assert/strict";
import test from "node:test";
import { haceCuanto } from "../lib/formato-tiempo.ts";

const AHORA = Date.parse("2026-08-11T12:00:00.000Z");
const hace = (ms: number) => new Date(AHORA - ms).toISOString();

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

test("sin fecha no inventa una", () => {
  assert.equal(haceCuanto(null), "sin datos");
});

test("una fecha ilegible se trata como ausencia, no como el año 1970", () => {
  assert.equal(haceCuanto("no es una fecha", AHORA), "sin datos");
});

test("escala de minutos, horas y días", () => {
  assert.equal(haceCuanto(hace(20_000), AHORA), "hace instantes");
  assert.equal(haceCuanto(hace(MINUTO), AHORA), "hace 1 minuto");
  assert.equal(haceCuanto(hace(7 * MINUTO), AHORA), "hace 7 minutos");
  assert.equal(haceCuanto(hace(HORA), AHORA), "hace 1 hora");
  assert.equal(haceCuanto(hace(5 * HORA), AHORA), "hace 5 horas");
});

// Pasadas las 48 horas, "hace 72 horas" obliga a dividir mentalmente. Es la
// misma regla que usa lib/salud/evaluar.ts para que las dos pantallas cuenten
// el tiempo igual.
test("más de dos días se cuenta en días", () => {
  assert.equal(haceCuanto(hace(47 * HORA), AHORA), "hace 47 horas");
  assert.equal(haceCuanto(hace(72 * HORA), AHORA), "hace 3 días");
});

// El reloj del navegador puede ir atrasado respecto del servidor. Antes que
// mostrar "hace -4 minutos", que no significa nada, se muestra el presente.
test("una marca en el futuro no produce un tiempo negativo", () => {
  assert.equal(haceCuanto(new Date(AHORA + 5 * MINUTO).toISOString(), AHORA), "hace instantes");
});

test("el reloj se recibe por parámetro: la función no lee la hora del sistema", () => {
  const marca = hace(3 * MINUTO);
  assert.equal(haceCuanto(marca, AHORA), "hace 3 minutos");
  assert.equal(haceCuanto(marca, AHORA + 60 * MINUTO), "hace 1 hora");
});
