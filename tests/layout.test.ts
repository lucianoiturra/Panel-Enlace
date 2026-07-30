import { test } from "node:test";
import assert from "node:assert/strict";
import semilla from "../lib/red/semilla.json" with { type: "json" };
import {
  anchoDeTexto, codigoDeEquipo, construirLayout, ordenDeZonas, resumenDePuertos,
  ANCHO_MINIMO, ZONA_BORDE,
} from "../lib/red/layout.ts";
import type { EstadoRed } from "../lib/red/modelo.ts";

const real = (): EstadoRed => ({ ...semilla, bitacora: [], cubiculos: [] } as unknown as EstadoRed);

test("las zonas salen en el orden de la cadena de uplinks, no por id", () => {
  assert.deepEqual(ordenDeZonas(real()), [ZONA_BORDE, "R1", "R2", "R3"]);
});

test("un rack sin uplink que lo alcance va al final, por id", () => {
  const estado = real();
  estado.equipos = [...estado.equipos, { id: "R0-SW1", rack: "R0", tipo: "switch", etiqueta: "Suelto", modelo: "", puertos: 8, color: "", x: 0, y: 0, nota: "" }];
  assert.deepEqual(ordenDeZonas(estado), [ZONA_BORDE, "R1", "R2", "R3", "R0"]);
});

test("el ancho sale del texto y nunca baja del mínimo", () => {
  assert.equal(anchoDeTexto("R2/SW1"), ANCHO_MINIMO);
  assert.equal(anchoDeTexto("PIE Administrativo"), Math.round(18 * 15 * 0.55) + 16);
});

test("el código del equipo es el id con barra", () => {
  assert.equal(codigoDeEquipo("R2-SW1"), "R2/SW1");
});

test("el resumen cuenta cada estado de puerto", () => {
  assert.deepEqual(resumenDePuertos(real(), "R2-PP2"), { total: 24, ocupados: 19, libres: 1, dañados: 0, sinVerificar: 4 });
  assert.deepEqual(resumenDePuertos(real(), "R1-PP1"), { total: 24, ocupados: 0, libres: 0, dañados: 0, sinVerificar: 24 });
});

test("cada equipo cae en su zona y en su fila", () => {
  const layout = construirLayout(real());
  const porId = new Map(layout.nodos.map(nodo => [nodo.id, nodo]));
  assert.equal(porId.get("pto:ISP-p0")?.zona, ZONA_BORDE);
  assert.equal(porId.get("pto:MIKROTIK-p0")?.zona, ZONA_BORDE);
  assert.equal(porId.get("eq:R2-SW2")?.zona, "R2");
  assert.equal(porId.get("eq:R2-SW2")?.fila, 0);
  assert.equal(porId.get("eq:R2-PP2")?.zona, "R2");
  assert.equal(porId.get("eq:R2-PP2")?.fila, 1);
});

test("la tarjeta cerrada lleva el código, no el rótulo largo", () => {
  const switche = construirLayout(real()).nodos.find(nodo => nodo.id === "eq:R2-SW1");
  assert.equal(switche?.codigo, "R2/SW1");
  assert.equal(switche?.etiqueta, "R2/SW1 · Switch 1 | Gigabit 24p Smart");
  assert.equal(switche?.abierta, false);
  assert.deepEqual(switche?.puertos, []);
  assert.equal(switche?.idsPuerto.length, 24);
  assert.equal(switche?.w, anchoDeTexto("R2/SW1"));
});

test("con todo cerrado el lienzo no pasa de 1400 unidades de ancho", () => {
  const layout = construirLayout(real());
  assert.ok(layout.ancho > 0);
  assert.ok(layout.ancho <= 1400, `mide ${layout.ancho}`);
});

test("dos tarjetas de la misma zona y fila no se solapan", () => {
  const layout = construirLayout(real());
  for (const zona of layout.zonas) {
    for (const fila of [0, 1, 2]) {
      const cartas = layout.nodos.filter(nodo => nodo.zona === zona.id && nodo.fila === fila).sort((a, b) => a.x - b.x);
      for (let i = 1; i < cartas.length; i += 1) {
        assert.ok(cartas[i].x >= cartas[i - 1].x + cartas[i - 1].w, `se solapan en ${zona.id} fila ${fila}`);
      }
    }
  }
});

test("las zonas no se solapan entre sí y siguen el orden calculado", () => {
  const layout = construirLayout(real());
  assert.deepEqual(layout.zonas.map(zona => zona.id), [ZONA_BORDE, "R1", "R2", "R3"]);
  const racks = layout.zonas.filter(zona => zona.id !== ZONA_BORDE).sort((a, b) => a.x - b.x);
  for (let i = 1; i < racks.length; i += 1) {
    assert.ok(racks[i].x >= racks[i - 1].x + racks[i - 1].w, "las zonas de rack se solapan");
  }
});

test("cada tarjeta cabe dentro de su zona", () => {
  const layout = construirLayout(real());
  const porId = new Map(layout.zonas.map(zona => [zona.id, zona]));
  for (const nodo of layout.nodos) {
    const zona = porId.get(nodo.zona);
    assert.ok(zona, `la zona ${nodo.zona} existe`);
    assert.ok(nodo.x >= zona.x && nodo.x + nodo.w <= zona.x + zona.w, `${nodo.id} se sale de ${zona.id}`);
  }
});

test("el layout trae las aristas ya agregadas", () => {
  assert.equal(construirLayout(real()).aristas.length, 16);
});
