import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture-red.ts";
import { etiquetaEndpoint, etiquetaPuerto, existeEndpoint, ordenCanonico, prefijoDe, validarEnlace } from "../lib/red/modelo.ts";

test("prefijoDe reconoce los tres prefijos y rechaza el resto", () => {
  assert.equal(prefijoDe("pto:R2-PP1-p14"), "pto");
  assert.equal(prefijoDe("esp:3-basico-b"), "esp");
  assert.equal(prefijoDe("cub:12"), "cub");
  assert.equal(prefijoDe("R2-PP1"), null);
  assert.equal(prefijoDe(""), null);
});

test("existeEndpoint resuelve puertos, espacios y cubículos", () => {
  const estado = fixture();
  assert.equal(existeEndpoint(estado, "pto:R2-PP1-p14"), true);
  assert.equal(existeEndpoint(estado, "esp:3-basico-b"), true);
  assert.equal(existeEndpoint(estado, "cub:12"), true);
  assert.equal(existeEndpoint(estado, "cub:99"), false);
  assert.equal(existeEndpoint(estado, "pto:R2-PP1-p99"), false);
  assert.equal(existeEndpoint(estado, "esp:inexistente"), false);
});

test("etiquetaPuerto usa el formato R2/PP1 p14 con dos dígitos", () => {
  const estado = fixture();
  assert.equal(etiquetaPuerto(estado, "pto:R2-PP1-p14"), "R2/PP1 p14");
  assert.equal(etiquetaPuerto(estado, "pto:R3-SW1-p02"), "R3/SW1 p02");
});

test("etiquetaEndpoint devuelve el nombre del espacio y del cubículo", () => {
  const estado = fixture();
  assert.equal(etiquetaEndpoint(estado, "esp:3-basico-b"), "3° Básico B");
  assert.equal(etiquetaEndpoint(estado, "cub:12"), "Cubículo 12");
  assert.equal(etiquetaEndpoint(estado, "pto:R2-SW1-p11"), "R2/SW1 p11");
  assert.equal(etiquetaEndpoint(estado, "esp:no-existe"), "esp:no-existe");
});

test("ordenCanonico deja el id menor primero, en los dos sentidos", () => {
  assert.deepEqual(ordenCanonico("pto:R2-PP1-p14", "esp:3-basico-b"), ["esp:3-basico-b", "pto:R2-PP1-p14"]);
  assert.deepEqual(ordenCanonico("esp:3-basico-b", "pto:R2-PP1-p14"), ["esp:3-basico-b", "pto:R2-PP1-p14"]);
});

test("validarEnlace acepta un enlace nuevo entre endpoints existentes", () => {
  const estado = fixture();
  assert.deepEqual(validarEnlace(estado, "esp:4-basico-a", "pto:R2-PP1-p15"), { ok: true });
  assert.deepEqual(validarEnlace(estado, "cub:12", "pto:R2-PP1-p15"), { ok: true });
});

test("validarEnlace rechaza endpoints inexistentes", () => {
  const estado = fixture();
  const sinA = validarEnlace(estado, "esp:no-existe", "pto:R2-PP1-p15");
  assert.equal(sinA.ok, false);
  assert.match(sinA.ok === false ? sinA.error : "", /no existe/);
  const sinB = validarEnlace(estado, "esp:4-basico-a", "pto:R2-PP1-p99");
  assert.equal(sinB.ok, false);
});

test("validarEnlace rechaza un endpoint contra sí mismo", () => {
  const estado = fixture();
  const resultado = validarEnlace(estado, "pto:R2-PP1-p15", "pto:R2-PP1-p15");
  assert.equal(resultado.ok, false);
  assert.match(resultado.ok === false ? resultado.error : "", /sí mismo/);
});

test("validarEnlace rechaza el duplicado en cualquiera de los dos órdenes", () => {
  const estado = fixture();
  const mismoOrden = validarEnlace(estado, "esp:3-basico-b", "pto:R2-PP1-p14");
  assert.equal(mismoOrden.ok, false);
  assert.match(mismoOrden.ok === false ? mismoOrden.error : "", /ya existe/);
  const ordenInverso = validarEnlace(estado, "pto:R2-PP1-p14", "esp:3-basico-b");
  assert.equal(ordenInverso.ok, false);
});

test("validarEnlace rechaza relaciones sin un puerto físico", () => {
  const estado = fixture();
  const entreEspacios = validarEnlace(estado, "esp:3-basico-b", "esp:4-basico-a");
  assert.equal(entreEspacios.ok, false);
  assert.match(entreEspacios.ok === false ? entreEspacios.error : "", /al menos un puerto/);

  const entreCubiculoYEspacio = validarEnlace(estado, "cub:12", "esp:4-basico-a");
  assert.equal(entreCubiculoYEspacio.ok, false);
});
