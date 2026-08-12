import { test } from "node:test";
import assert from "node:assert/strict";
import semilla from "../lib/red/semilla.json" with { type: "json" };
import { CATEGORIAS_BASE, type EstadoRed } from "../lib/red/modelo.ts";
import { ANCHO_ABIERTA, CAPAS, capaDeEquipo, construirFlujo, cruces } from "../lib/red/flujo.ts";

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

test("los switches se agrupan en un bloque por rack", () => {
  const flujo = construirFlujo(real());
  const bloques = flujo.bloques.filter(bloque => bloque.capa === "switches");
  assert.deepEqual(bloques.map(bloque => bloque.id).sort(), ["R1", "R2", "R3"]);
  assert.equal(bloques.every(bloque => bloque.colapsable === false), true);
});

test("los destinos se agrupan por tipo de espacio, más cubículos y APs", () => {
  const estado = real();
  estado.cubiculos = [{ id: 1, status: "operational", ip: "", mac: "", inventoryCode: "" }];
  estado.enlaces = [...estado.enlaces, { id: 900, a: "cub:1", b: "pto:R2-PP1-p1", tipo: "roseta", nota: "" }];
  const flujo = construirFlujo(estado);
  const ids = flujo.bloques.filter(bloque => bloque.capa === "destinos").map(bloque => bloque.id);
  assert.ok(ids.includes("grp:cubiculos"), `bloques: ${ids.join(", ")}`);
  assert.ok(ids.some(id => id.startsWith("grp:") && id !== "grp:cubiculos" && id !== "grp:aps"));
});

test("un grupo de destinos colapsado no dibuja a sus miembros", () => {
  const flujo = construirFlujo(real());
  const grupo = flujo.bloques.find(bloque => bloque.capa === "destinos");
  assert.ok(grupo, "tiene que haber al menos un grupo de destinos");
  assert.equal(grupo.abierto, false);
  assert.ok(grupo.cuenta > 0);
  assert.equal(flujo.nodos.some(nodo => nodo.bloque === grupo.id), false);
});

test("abrir el grupo dibuja a sus miembros", () => {
  const estado = real();
  const grupo = construirFlujo(estado).bloques.find(bloque => bloque.capa === "destinos")!;
  const flujo = construirFlujo(estado, new Set([grupo.id]));
  assert.equal(flujo.nodos.filter(nodo => nodo.bloque === grupo.id).length, grupo.cuenta);
});

// El orden se aplica por bloque (rack) y se publica en flujo.grupos: nodos.x/y
// reflejan el orden, pero el array flujo.nodos conserva el orden de creación
// y no es donde se verifica el orden manual.
test("el orden manual manda sobre el automático", () => {
  const estado = real();
  const idsR2 = construirFlujo(estado).nodos.filter(nodo => nodo.capa === "switches" && nodo.bloque === "R2").map(nodo => nodo.id);
  const grupoR2 = (flujo: ReturnType<typeof construirFlujo>) =>
    flujo.grupos.find(grupo => grupo.length === idsR2.length && grupo.every(id => idsR2.includes(id)))!;
  const sinOrden = grupoR2(construirFlujo(estado));
  estado.orden = Object.fromEntries([...sinOrden].reverse().map((id, indice) => [id, indice]));
  const conOrden = grupoR2(construirFlujo(estado));
  assert.deepEqual(conOrden, [...sinOrden].reverse());
});

test("cada bloque publica su grupo reordenable", () => {
  const flujo = construirFlujo(real());
  const switches = flujo.nodos.filter(nodo => nodo.capa === "switches" && nodo.bloque === "R2").map(nodo => nodo.id);
  assert.ok(flujo.grupos.some(grupo => grupo.length === switches.length && grupo.every(id => switches.includes(id))));
});

// El baricentro es una heurística: no garantiza el mínimo, sí garantiza no
// empeorar respecto del orden alfabético, que es con lo que se compara.
test("el baricentro no produce más cruces que el orden alfabético", () => {
  const estado = real();
  const conBaricentro = cruces(construirFlujo(estado));
  const alfabetico = construirFlujo(estado, new Set(), { baricentro: false });
  assert.ok(conBaricentro <= cruces(alfabetico), `baricentro ${conBaricentro} vs alfabético ${cruces(alfabetico)}`);
});

// El orden se aplica por bloque y se lee de flujo.grupos, igual que en la
// prueba equivalente del orden manual sobre el automático.
test("el orden manual sigue mandando sobre el baricentro", () => {
  const estado = real();
  const idsR2 = construirFlujo(estado).nodos.filter(nodo => nodo.capa === "patch" && nodo.bloque === "R2").map(nodo => nodo.id);
  const grupoR2 = (flujo: ReturnType<typeof construirFlujo>) =>
    flujo.grupos.find(grupo => grupo.length === idsR2.length && grupo.every(id => idsR2.includes(id)))!;
  const sinOrden = grupoR2(construirFlujo(estado));
  estado.orden = Object.fromEntries([...sinOrden].reverse().map((id, indice) => [id, indice]));
  const conOrden = grupoR2(construirFlujo(estado));
  assert.deepEqual(conOrden, [...sinOrden].reverse());
});

test("el mismo estado produce siempre el mismo dibujo", () => {
  const estado = real();
  assert.deepEqual(
    construirFlujo(estado).nodos.map(nodo => [nodo.id, nodo.x, nodo.y]),
    construirFlujo(estado).nodos.map(nodo => [nodo.id, nodo.x, nodo.y]),
  );
});
