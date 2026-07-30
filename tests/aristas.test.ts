import { test } from "node:test";
import assert from "node:assert/strict";
import semilla from "../lib/red/semilla.json" with { type: "json" };
import { agruparEnlaces, aristasParaDibujar, nodoDeExtremo, puntasDelEnlace } from "../lib/red/aristas.ts";
import { existeEndpoint } from "../lib/red/modelo.ts";
import type { EstadoRed } from "../lib/red/modelo.ts";

// semilla.json no trae ids: los pone la columna serial al sembrar. Aquí se
// numeran igual que en la base para probar sobre lo que la app recibe de verdad.
const real = (): EstadoRed => {
  const estado = { ...semilla, bitacora: [], cubiculos: [] } as unknown as EstadoRed;
  estado.enlaces = estado.enlaces.map((enlace, indice) => ({ ...enlace, id: indice + 1 }));
  return estado;
};

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

test("una arista de un solo enlace lleva su id para poder reengancharla", () => {
  const estado = real();
  const roseta = estado.enlaces.find(enlace => enlace.a === "esp:utp-e-basica" || enlace.b === "esp:utp-e-basica");
  assert.ok(roseta);
  const arista = agruparEnlaces(estado).find(candidata => candidata.a === "esp:utp-e-basica" || candidata.b === "esp:utp-e-basica");
  assert.equal(arista?.cuenta, 1);
  assert.equal(arista?.enlaceId, roseta.id);
});

test("una arista agregada no lleva id: representa varios enlaces a la vez", () => {
  const par = agruparEnlaces(real()).find(arista => arista.clave === "eq:R2-PP3|eq:R2-SW3");
  assert.equal(par?.cuenta, 24);
  assert.equal(par?.enlaceId, 0);
});

test("al desagregarse, cada arista suelta recupera el id de su enlace", () => {
  const estado = real();
  const aristas = aristasParaDibujar(estado, new Set(["eq:R2-SW3", "eq:R2-PP3"]));
  assert.ok(aristas.filter(arista => /^e\d+$/.test(arista.clave)).length >= 24);
  const porId = new Map(estado.enlaces.map(enlace => [enlace.id, enlace]));
  // Toda arista que valga por un solo enlace tiene que poder resolverlo, si no
  // el diagrama ofrecería una manija que luego no sabe qué reenganchar.
  for (const arista of aristas.filter(candidata => candidata.cuenta === 1)) {
    const enlace = porId.get(arista.enlaceId);
    assert.ok(enlace, `la arista ${arista.clave} apunta a un enlace real`);
    // Con la tarjeta abierta la punta es el puerto y con ella cerrada es el
    // equipo, así que se comparan ya colapsadas: da igual la forma, la arista
    // tiene que unir los mismos dos nodos que su enlace.
    const colapsar = (ids: string[]) => ids.map(id => nodoDeExtremo(estado, id)).sort();
    assert.deepEqual(colapsar([arista.a, arista.b]), colapsar([enlace.a, enlace.b]));
  }
});

test("con la tarjeta cerrada, la punta agarrada se resuelve al puerto y no al equipo", () => {
  const estado = real();
  const enlace = estado.enlaces.find(candidato => candidato.a === "pto:R2-PP1-p19" || candidato.b === "pto:R2-PP1-p19");
  assert.ok(enlace, "existe el enlace de la roseta de UTP E. Básica");
  // Cerrada, el diagrama dibuja esa punta sobre la tarjeta del panel.
  const puntas = puntasDelEnlace(estado, enlace, "eq:R2-PP1");
  assert.equal(puntas.fijo, "pto:R2-PP1-p19");
  assert.equal(puntas.suelto, "esp:utp-e-basica");
});

test("agarrar la otra punta deja fijo el destino y suelto el puerto", () => {
  const estado = real();
  const enlace = estado.enlaces.find(candidato => candidato.a === "esp:utp-e-basica" || candidato.b === "esp:utp-e-basica");
  assert.ok(enlace);
  const puntas = puntasDelEnlace(estado, enlace, "esp:utp-e-basica");
  assert.equal(puntas.fijo, "esp:utp-e-basica");
  assert.equal(puntas.suelto, "pto:R2-PP1-p19");
});

test("con la tarjeta abierta la punta ya es el puerto y se respeta igual", () => {
  const estado = real();
  const enlace = estado.enlaces.find(candidato => candidato.a === "pto:R2-PP1-p19" || candidato.b === "pto:R2-PP1-p19");
  assert.ok(enlace);
  const puntas = puntasDelEnlace(estado, enlace, "pto:R2-PP1-p19");
  assert.equal(puntas.fijo, "pto:R2-PP1-p19");
  assert.equal(puntas.suelto, "esp:utp-e-basica");
});

// El extremo fijo se manda tal cual a POST /api/red/enlaces, y validarEnlace
// rechaza cualquier id que no sea un endpoint real: un `eq:…` daría 400.
test("la punta fija siempre es un endpoint que la API acepta", () => {
  const estado = real();
  for (const arista of aristasParaDibujar(estado, new Set()).filter(candidata => candidata.enlaceId > 0)) {
    const enlace = estado.enlaces.find(candidato => candidato.id === arista.enlaceId);
    assert.ok(enlace);
    for (const dibujada of [arista.a, arista.b]) {
      const { fijo, suelto } = puntasDelEnlace(estado, enlace, dibujada);
      assert.ok(existeEndpoint(estado, fijo), `${fijo} no es un endpoint real`);
      assert.ok(existeEndpoint(estado, suelto), `${suelto} no es un endpoint real`);
      assert.notEqual(fijo, suelto);
    }
  }
});

test("un destino no tiene rejilla, así que basta con abrir el panel", () => {
  const aristas = aristasParaDibujar(real(), new Set(["eq:R2-PP1"]));
  const roseta = aristas.find(arista => arista.a === "esp:utp-e-basica" || arista.b === "esp:utp-e-basica");
  assert.ok(roseta);
  assert.equal(roseta.cuenta, 1);
  assert.equal([roseta.a, roseta.b].includes("pto:R2-PP1-p19"), true);
});
