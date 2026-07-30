import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture-red.ts";
import semilla from "../lib/red/semilla.json" with { type: "json" };
import {
  anchoDeTexto, anclasDeLayout, capaDeEquipo, codigoDeEquipo, construirLayout,
  ordenDeZonas, resumenDePuertos, ANCHO_MINIMO,
} from "../lib/red/layout.ts";
import { puertosDeEndpoint, type EstadoRed } from "../lib/red/modelo.ts";

test("capaDeEquipo ordena los tipos de arriba hacia abajo", () => {
  assert.equal(capaDeEquipo("isp"), 0);
  assert.equal(capaDeEquipo("firewall"), 1);
  assert.equal(capaDeEquipo("router"), 1);
  assert.equal(capaDeEquipo("switch"), 2);
  assert.equal(capaDeEquipo("patchpanel"), 3);
  assert.equal(capaDeEquipo("ap"), 4);
});

test("cada equipo cae en su capa y con el id que esperan los enlaces", () => {
  const layout = construirLayout(fixture());
  const porId = new Map(layout.nodos.map(nodo => [nodo.id, nodo]));
  assert.equal(porId.get("pto:ISP-p0")?.capa, 0);
  assert.equal(porId.get("pto:ISP-p0")?.clase, "aparato");
  assert.equal(porId.get("pto:MIKROTIK-p0")?.capa, 1);
  assert.equal(porId.get("eq:R2-SW1")?.capa, 2);
  assert.equal(porId.get("eq:R3-SW1")?.capa, 2);
  assert.equal(porId.get("eq:R2-PP1")?.capa, 3);
  assert.equal(porId.get("eq:R2-PP1")?.clase, "equipo");
});

test("los equipos con puertos exponen sus puertos dentro de su caja", () => {
  const layout = construirLayout(fixture());
  const panel = layout.nodos.find(nodo => nodo.id === "eq:R2-PP1");
  assert.ok(panel);
  assert.deepEqual(panel.puertos.map(puerto => puerto.n), [14, 15, 16]);
  for (const puerto of panel.puertos) {
    assert.ok(puerto.x >= 0, "el puerto empieza dentro de la caja");
    assert.ok(puerto.x + puerto.w <= panel.w, "el puerto termina dentro de la caja");
    assert.ok(puerto.y + puerto.h <= panel.h, "el puerto cabe en alto");
  }
});

test("dos nodos de la misma capa no se solapan", () => {
  const layout = construirLayout(fixture());
  for (const capa of [0, 1, 2, 3, 4]) {
    const fila = layout.nodos.filter(nodo => nodo.capa === capa).sort((a, b) => a.x - b.x);
    for (let indice = 1; indice < fila.length; indice += 1) {
      assert.ok(fila[indice].x >= fila[indice - 1].x + fila[indice - 1].w, `se solapan en la capa ${capa}`);
    }
  }
});

test("un espacio con puerto va al flujo y uno sin puerto va a la bandeja", () => {
  const layout = construirLayout(fixture());
  const ids = layout.nodos.map(nodo => nodo.id);
  assert.equal(ids.includes("esp:3-basico-b"), true);
  assert.equal(ids.includes("esp:4-basico-a"), false);
  const enBandeja = layout.bandeja.map(ficha => ficha.id);
  assert.equal(enBandeja.includes("esp:4-basico-a"), true);
  assert.equal(enBandeja.includes("esp:3-basico-b"), false);
});

test("los cubículos sin puerto van a la bandeja con su grupo", () => {
  const layout = construirLayout(fixture());
  const cubiculo = layout.bandeja.find(ficha => ficha.id === "cub:12");
  assert.equal(cubiculo?.etiqueta, "Cubículo 12");
  assert.equal(cubiculo?.grupo, "Cubículos");
});

test("un espacio en el flujo queda en la última capa", () => {
  const layout = construirLayout(fixture());
  const espacio = layout.nodos.find(nodo => nodo.id === "esp:3-basico-b");
  assert.equal(espacio?.capa, 4);
  assert.equal(espacio?.clase, "espacio");
});

test("las aristas guardan el punto y el nodo de cada extremo", () => {
  const layout = construirLayout(fixture());
  const roseta = layout.aristas.find(arista => arista.a === "esp:3-basico-b" || arista.b === "esp:3-basico-b");
  assert.ok(roseta);
  assert.equal(roseta.tipo, "roseta");
  const nodos = [roseta.nodoA, roseta.nodoB].sort();
  assert.deepEqual(nodos, ["eq:R2-PP1", "esp:3-basico-b"]);
});

test("un equipo desconectado del ISP se marca como isla", () => {
  const estado = fixture();
  estado.equipos.push({ id: "FORTINET", rack: "R2", tipo: "firewall", etiqueta: "Fortinet", modelo: "", puertos: 0, color: "", x: 0, y: 0, nota: "" });
  estado.puertos.push({ id: "pto:FORTINET-p0", equipo: "FORTINET", n: 0, estado: "ocupado", nota: "" });
  const layout = construirLayout(estado);
  assert.equal(layout.nodos.find(nodo => nodo.id === "pto:FORTINET-p0")?.isla, true);
  assert.equal(layout.nodos.find(nodo => nodo.id === "eq:R2-SW1")?.isla, false);
});

test("anclasDeLayout ubica puertos y nodos en coordenadas absolutas", () => {
  const layout = construirLayout(fixture());
  const anclas = anclasDeLayout(layout);
  const panel = layout.nodos.find(nodo => nodo.id === "eq:R2-PP1");
  const puerto = panel?.puertos.find(candidato => candidato.n === 15);
  assert.ok(panel && puerto);
  const ancla = anclas.get("pto:R2-PP1-p15");
  assert.equal(ancla?.x, panel.x + puerto.x + puerto.w / 2);
  assert.equal(ancla?.y, panel.y + puerto.y + puerto.h / 2);
  assert.ok(anclas.has("eq:R2-PP1"));
  assert.ok(anclas.has("esp:3-basico-b"));
});

test("con la semilla real la bandeja contiene todos los puntos sin puerto", () => {
  const estado = { ...semilla, bitacora: [], cubiculos: [] } as unknown as EstadoRed;
  const layout = construirLayout(estado);
  const sinPuerto = estado.espacios.filter(espacio => !puertosDeEndpoint(estado, espacio.id).length);
  assert.equal(layout.bandeja.length, sinPuerto.length);
  assert.ok(layout.bandeja.length > 0);
  assert.equal(layout.nodos.some(nodo => layout.bandeja.some(ficha => ficha.id === nodo.id)), false);
});

test("las zonas salen en el orden de la cadena de uplinks, no por id", () => {
  const estado = { ...semilla, bitacora: [], cubiculos: [] } as unknown as EstadoRed;
  assert.deepEqual(ordenDeZonas(estado), ["borde", "R1", "R2", "R3"]);
});

test("un rack sin uplink que lo alcance va al final, por id", () => {
  const estado = { ...semilla, bitacora: [], cubiculos: [] } as unknown as EstadoRed;
  estado.equipos = [...estado.equipos, { id: "R0-SW1", rack: "R0", tipo: "switch", etiqueta: "Suelto", modelo: "", puertos: 8, color: "", x: 0, y: 0, nota: "" }];
  assert.deepEqual(ordenDeZonas(estado), ["borde", "R1", "R2", "R3", "R0"]);
});

test("el ancho sale del texto y nunca baja del mínimo", () => {
  assert.equal(anchoDeTexto("R2/SW1"), ANCHO_MINIMO);
  assert.equal(anchoDeTexto("PIE Administrativo"), Math.round(18 * 15 * 0.55) + 16);
  assert.ok(anchoDeTexto("PIE Administrativo") > ANCHO_MINIMO);
});

test("el código del equipo es el id con barra", () => {
  assert.equal(codigoDeEquipo("R2-SW1"), "R2/SW1");
  assert.equal(codigoDeEquipo("AP-sala-multicopiado"), "AP/sala-multicopiado");
});

test("el resumen cuenta cada estado de puerto", () => {
  const estado = { ...semilla, bitacora: [], cubiculos: [] } as unknown as EstadoRed;
  assert.deepEqual(resumenDePuertos(estado, "R2-PP2"), { total: 24, ocupados: 19, libres: 1, dañados: 0, sinVerificar: 4 });
  assert.deepEqual(resumenDePuertos(estado, "R1-PP1"), { total: 24, ocupados: 0, libres: 0, dañados: 0, sinVerificar: 24 });
});
