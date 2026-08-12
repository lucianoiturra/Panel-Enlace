import { test } from "node:test";
import assert from "node:assert/strict";
import semilla from "../lib/red/semilla.json" with { type: "json" };
import { CATEGORIAS_BASE, type EstadoRed } from "../lib/red/modelo.ts";
import { ANCHO_ABIERTA, CAPAS, capaDeEquipo, construirFlujo } from "../lib/red/flujo.ts";

const real = (): EstadoRed => ({ ...semilla, bitacora: [], cubiculos: [], categorias: CATEGORIAS_BASE, orden: {} } as unknown as EstadoRed);

test("cada tipo de equipo cae en su capa", () => {
  assert.equal(capaDeEquipo("isp"), "borde");
  assert.equal(capaDeEquipo("firewall"), "borde");
  assert.equal(capaDeEquipo("router"), "borde");
  assert.equal(capaDeEquipo("switch"), "switches");
  assert.equal(capaDeEquipo("patchpanel"), "patch");
});

// Un AP cuelga de un puerto y no tiene puertos propios que mostrar: es una hoja,
// aunque esté enchufado directo al firewall como AP-cab-enlace.
test("un punto de acceso es siempre un destino", () => {
  assert.equal(capaDeEquipo("ap"), "destinos");
});

test("las capas van del borde a los destinos", () => {
  assert.deepEqual(CAPAS, ["borde", "switches", "patch", "destinos"]);
});

test("cada equipo cae en la columna de su capa", () => {
  const flujo = construirFlujo(real());
  const porId = new Map(flujo.nodos.map(nodo => [nodo.id, nodo]));
  assert.equal(porId.get("pto:ISP-p0")?.capa, "borde");
  assert.equal(porId.get("eq:R2-SW1")?.capa, "switches");
  assert.equal(porId.get("eq:R2-PP2")?.capa, "patch");
});

test("hay una columna por capa con contenido, en orden", () => {
  const flujo = construirFlujo(real());
  assert.deepEqual(flujo.columnas.map(columna => columna.capa), CAPAS);
  for (let i = 1; i < flujo.columnas.length; i += 1) {
    assert.ok(flujo.columnas[i].x > flujo.columnas[i - 1].x, "las columnas van de izquierda a derecha");
  }
});

// La propiedad que arregla el problema de fondo: abrir una tarjeta no puede
// mover una columna de lugar, o `ajustar()` vuelve a pelear con un lienzo que
// cambia de forma bajo sus pies.
test("el ancho del lienzo es el mismo con todo cerrado y con todo abierto", () => {
  const estado = real();
  const cerrado = construirFlujo(estado);
  const todas = new Set(cerrado.nodos.filter(nodo => nodo.clase === "equipo").map(nodo => nodo.id));
  const abierto = construirFlujo(estado, todas);
  assert.equal(abierto.ancho, cerrado.ancho);
  assert.deepEqual(abierto.columnas.map(c => c.x), cerrado.columnas.map(c => c.x));
  assert.ok(abierto.alto > cerrado.alto, "abrir tiene que crecer hacia abajo");
});

test("una columna con equipos de rejilla reserva el ancho de una tarjeta abierta", () => {
  const flujo = construirFlujo(real());
  const switches = flujo.columnas.find(columna => columna.capa === "switches");
  assert.equal(switches?.w, ANCHO_ABIERTA);
});

test("el equipo más grande cabe en tres filas de puertos", () => {
  const estado = real();
  const flujo = construirFlujo(estado, new Set(["eq:R3-SW1"]));
  const nodo = flujo.nodos.find(item => item.id === "eq:R3-SW1");
  assert.equal(nodo?.puertos.length, 28);
  assert.equal(nodo?.abierta, true);
  assert.ok((nodo?.w ?? 0) <= ANCHO_ABIERTA);
});
