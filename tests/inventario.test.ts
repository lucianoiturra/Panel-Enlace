import { test } from "node:test";
import assert from "node:assert/strict";
import { limpiarNotaRack, pareceIp, pareceSegmento } from "../lib/red/inventario.ts";

test("limpiarNotaRack deja vacías las notas que solo traían canvas y segmento", () => {
  const r1 = limpiarNotaRack("Rack 1 — **Segmento IP:** por confirmar (detectados: 192.168.20/30/60.x)");
  assert.equal(r1.notas, "");
  assert.equal(r1.segmento, "");

  const r3 = limpiarNotaRack([
    "relación dibujada en el canvas hacia: ## Salas de clases",
    "relación dibujada en el canvas hacia: ## Rosetas",
    "relación dibujada en el canvas hacia: ## Sala de clases",
    "Rack 3 — **Segmento IP:** por confirmar (detectados: 192.168.20/30/60.x)",
  ].join("\n"));
  assert.equal(r3.notas, "");
  assert.equal(r3.segmento, "");
});

test("limpiarNotaRack conserva los puertos identificados que comparten línea con el segmento", () => {
  const r2 = limpiarNotaRack([
    "relación dibujada en el canvas hacia: Administrativo",
    "Rack 2 — **Segmento IP:** por confirmar (detectados: 192.168.20/30/60.x) **Puertos identificados:** - UTP → R2/P1 D19 - PIE Básica → R2/P1 D18",
  ].join("\n"));
  assert.equal(r2.notas, "Puertos identificados: - UTP → R2/P1 D19 - PIE Básica → R2/P1 D18");
  assert.equal(r2.segmento, "");
});

test("limpiarNotaRack extrae el segmento cuando de verdad es uno", () => {
  const nota = limpiarNotaRack("Rack 4 — **Segmento IP:** 192.168.40.0/24");
  assert.equal(nota.segmento, "192.168.40.0/24");
  assert.equal(nota.notas, "");
});

test("limpiarNotaRack no toca una nota escrita a mano", () => {
  const nota = limpiarNotaRack("Gabinete mural con llave. La llave está en conserjería.");
  assert.equal(nota.notas, "Gabinete mural con llave. La llave está en conserjería.");
  assert.equal(nota.segmento, "");
});

test("pareceSegmento acepta CIDR y rechaza el resto", () => {
  assert.equal(pareceSegmento("192.168.30.0/24"), true);
  assert.equal(pareceSegmento("10.0.0.0/8"), true);
  assert.equal(pareceSegmento("192.168.20/30/60.x"), false);
  assert.equal(pareceSegmento("por confirmar"), false);
  assert.equal(pareceSegmento("999.1.1.1/24"), false);
  assert.equal(pareceSegmento("192.168.30.0/33"), false);
  assert.equal(pareceSegmento(""), false);
});

test("pareceIp acepta IPv4 y rechaza el resto", () => {
  assert.equal(pareceIp("192.168.30.2"), true);
  assert.equal(pareceIp("192.168.30.0/24"), false);
  assert.equal(pareceIp("999.1.1.1"), false);
  assert.equal(pareceIp(""), false);
});
