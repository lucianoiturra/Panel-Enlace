import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture-red.ts";
import { agruparPorTipo, ordenarEspacios } from "../lib/red/agrupar.ts";
import type { Categoria, Espacio } from "../lib/red/modelo.ts";

const espacio = (id: string, nombre: string, categoria: string, estado: Espacio["estado"] = "sin-verificar"): Espacio =>
  ({ id, nombre, ubicacion: "", categoria, estado, x: 0, y: 0, nota: "" });

const categorias: Categoria[] = [
  { id: "sala", nombre: "Sala", orden: 0, fija: true },
  { id: "oficina", nombre: "Oficina", orden: 1, fija: true },
  { id: "laboratorio", nombre: "Laboratorio", orden: 3, fija: false },
];

test("ordenarEspacios por nombre respeta acentos y numeración natural", () => {
  const espacios = [espacio("a", "10° Básico", "sala"), espacio("b", "2° Básico", "sala"), espacio("c", "Ática", "sala")];
  assert.deepEqual(ordenarEspacios(espacios, "nombre", categorias).map(uno => uno.nombre), ["2° Básico", "10° Básico", "Ática"]);
});

test("ordenarEspacios por tipo sigue el orden de las categorías, no el alfabético", () => {
  const espacios = [espacio("a", "Lab 1", "laboratorio"), espacio("b", "Secretaría", "oficina"), espacio("c", "Sala 1", "sala")];
  assert.deepEqual(ordenarEspacios(espacios, "tipo", categorias).map(uno => uno.id), ["c", "b", "a"]);
});

test("ordenarEspacios por tipo desempata por nombre dentro del mismo tipo", () => {
  const espacios = [espacio("a", "Sala Z", "sala"), espacio("b", "Sala A", "sala"), espacio("c", "Secretaría", "oficina")];
  assert.deepEqual(ordenarEspacios(espacios, "tipo", categorias).map(uno => uno.nombre), ["Sala A", "Sala Z", "Secretaría"]);
});

test("ordenarEspacios manda al final los tipos que ya no existen", () => {
  const espacios = [espacio("a", "Bodega", "fantasma"), espacio("b", "Sala 1", "sala")];
  assert.deepEqual(ordenarEspacios(espacios, "tipo", categorias).map(uno => uno.id), ["b", "a"]);
});

test("ordenarEspacios por estado usa el orden de estadosEspacio", () => {
  const espacios = [
    espacio("a", "Uno", "sala", "sin-verificar"),
    espacio("b", "Dos", "sala", "operativo"),
    espacio("c", "Tres", "sala", "sin-internet"),
  ];
  assert.deepEqual(ordenarEspacios(espacios, "estado", categorias).map(uno => uno.id), ["b", "c", "a"]);
});

test("ordenarEspacios no muta el arreglo recibido", () => {
  const espacios = [espacio("a", "Zeta", "sala"), espacio("b", "Alfa", "sala")];
  ordenarEspacios(espacios, "nombre", categorias);
  assert.deepEqual(espacios.map(uno => uno.id), ["a", "b"]);
});

test("agruparPorTipo omite los grupos vacíos y respeta el orden de las categorías", () => {
  const espacios = [espacio("a", "Lab 1", "laboratorio"), espacio("b", "Sala 1", "sala")];
  const grupos = agruparPorTipo(espacios, categorias);
  assert.deepEqual(grupos.map(grupo => grupo.id), ["sala", "laboratorio"]);
  assert.deepEqual(grupos.map(grupo => grupo.espacios.length), [1, 1]);
});

test("agruparPorTipo recoge en «Sin tipo» los espacios cuyo tipo desapareció", () => {
  const espacios = [espacio("a", "Bodega", "fantasma"), espacio("b", "Sala 1", "sala")];
  const grupos = agruparPorTipo(espacios, categorias);
  assert.deepEqual(grupos.map(grupo => grupo.nombre), ["Sala", "Sin tipo"]);
  assert.deepEqual(grupos.at(-1)?.espacios.map(uno => uno.id), ["a"]);
});

test("agruparPorTipo mantiene todos los espacios que recibe", () => {
  const estado = fixture();
  const grupos = agruparPorTipo(estado.espacios, estado.categorias);
  assert.equal(grupos.reduce((total, grupo) => total + grupo.espacios.length, 0), estado.espacios.length);
});
