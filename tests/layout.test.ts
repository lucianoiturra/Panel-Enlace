import { test } from "node:test";
import assert from "node:assert/strict";
import semilla from "../lib/red/semilla.json" with { type: "json" };
import {
  anchoDeTexto, anclasDeLayout, codigoDeEquipo, construirLayout, ordenDeZonas, ordenarPor, resumenDePuertos,
  ANCHO_MINIMO, ANCHO_PUERTO, COLUMNAS_PUERTO, ZONA_BORDE,
} from "../lib/red/layout.ts";
import { CATEGORIAS_BASE, type EstadoRed } from "../lib/red/modelo.ts";

const real = (): EstadoRed => ({ ...semilla, bitacora: [], cubiculos: [], categorias: CATEGORIAS_BASE, orden: {} } as unknown as EstadoRed);

test("las zonas salen en el orden de la cadena de uplinks, no por id", () => {
  assert.deepEqual(ordenDeZonas(real()), [ZONA_BORDE, "R1", "R2", "R3"]);
});

test("un rack sin uplink que lo alcance va al final, por id", () => {
  const estado = real();
  estado.equipos = [...estado.equipos, { id: "R0-SW1", rack: "R0", tipo: "switch", etiqueta: "Suelto", marca: "", modelo: "", ipGestion: "", puertos:8, color: "", x: 0, y: 0, nota: "" }];
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
      const cartas = layout.nodos.filter(nodo => nodo.zona === zona.id && nodo.fila === fila);
      for (let i = 0; i < cartas.length; i += 1) {
        for (let j = i + 1; j < cartas.length; j += 1) {
          const a = cartas[i];
          const b = cartas[j];
          const separadas = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          assert.ok(separadas, `${a.id} y ${b.id} se solapan en ${zona.id} fila ${fila}`);
        }
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

test("un espacio con puerto cuelga de su panel, en la fila de destinos", () => {
  const layout = construirLayout(real());
  const destino = layout.nodos.find(nodo => nodo.id === "esp:utp-e-basica");
  assert.equal(destino?.zona, "R2");
  assert.equal(destino?.fila, 2);
  assert.equal(destino?.clase, "espacio");
  assert.equal(destino?.codigo, "UTP E. Básica");
});

test("dos destinos del mismo panel se apilan en la misma columna", () => {
  const layout = construirLayout(real());
  const uno = layout.nodos.find(nodo => nodo.id === "esp:utp-e-basica");
  const otro = layout.nodos.find(nodo => nodo.id === "esp:pie-administrativo");
  assert.ok(uno && otro);
  assert.equal(uno.x, otro.x, "comparten columna");
  assert.notEqual(uno.y, otro.y, "no comparten fila");
});

test("un AP enlazado es un destino y uno sin enlace va a la bandeja", () => {
  const layout = construirLayout(real());
  const ids = layout.nodos.map(nodo => nodo.id);
  assert.equal(ids.includes("pto:AP-sala-de-profesores-p0"), true);
  assert.equal(ids.includes("pto:AP-wifi-direccion-p0"), false);
  const ficha = layout.bandeja.find(item => item.id === "pto:AP-wifi-direccion-p0");
  assert.equal(ficha?.grupo, "Equipos sin enlace");
  assert.equal(ficha?.etiqueta, "AP/wifi-direccion · Wifi Dirección");
});

test("R3/PP2 se queda en su rack aunque no tenga enlaces, marcado sin ruta", () => {
  const layout = construirLayout(real());
  const panel = layout.nodos.find(nodo => nodo.id === "eq:R3-PP2");
  assert.equal(panel?.zona, "R3");
  assert.equal(panel?.sinRuta, true);
  assert.equal(layout.bandeja.some(ficha => ficha.id === "eq:R3-PP2"), false);
});

test("FORTINET y MIKROTIK quedan en la banda de borde, sin ruta", () => {
  const layout = construirLayout(real());
  for (const id of ["pto:FORTINET-p0", "pto:MIKROTIK-p0"]) {
    const nodo = layout.nodos.find(candidato => candidato.id === id);
    assert.equal(nodo?.zona, ZONA_BORDE, `${id} está en el borde`);
    assert.equal(nodo?.sinRuta, true, `${id} no alcanza al ISP`);
  }
  assert.equal(layout.nodos.find(nodo => nodo.id === "eq:R2-SW1")?.sinRuta, false);
});

test("un equipo de un puerto hereda el estado dañado para mostrar su simbología", () => {
  const estado = real();
  estado.puertos = estado.puertos.map(puerto =>
    puerto.id === "pto:MIKROTIK-p0" ? { ...puerto, estado: "dañado" } : puerto);
  const mikrotik = construirLayout(estado).nodos.find(nodo => nodo.id === "pto:MIKROTIK-p0");
  assert.equal(mikrotik?.estado, "dañado");
});

test("la zona se ensancha al destino más ancho que cuelga de ella", () => {
  const layout = construirLayout(real());
  const zona = layout.zonas.find(candidata => candidata.id === "R2");
  const destino = layout.nodos.find(nodo => nodo.id === "esp:pie-administrativo");
  assert.ok(zona && destino);
  assert.ok(destino.x + destino.w <= zona.x + zona.w);
  assert.equal(destino.w, anchoDeTexto("PIE Administrativo"));
});

test("con todo cerrado el lienzo sigue sin pasar de 1400 de ancho", () => {
  assert.ok(construirLayout(real()).ancho <= 1400);
});

const ANCHO_ABIERTA = COLUMNAS_PUERTO * ANCHO_PUERTO + 16;

test("una tarjeta abierta mide 12 columnas, tenga 24 o 28 puertos", () => {
  const layout = construirLayout(real(), new Set(["eq:R2-PP2", "eq:R2-SW3"]));
  const panel = layout.nodos.find(nodo => nodo.id === "eq:R2-PP2");
  const switche = layout.nodos.find(nodo => nodo.id === "eq:R2-SW3");
  assert.equal(panel?.abierta, true);
  assert.equal(panel?.w, ANCHO_ABIERTA);
  assert.equal(panel?.puertos.length, 24);
  assert.equal(switche?.puertos.length, 28);
  assert.equal(switche?.w, ANCHO_ABIERTA);
});

test("los puertos de una tarjeta abierta caben dentro de ella", () => {
  const panel = construirLayout(real(), new Set(["eq:R2-PP2"])).nodos.find(nodo => nodo.id === "eq:R2-PP2");
  assert.ok(panel);
  for (const puerto of panel.puertos) {
    assert.ok(puerto.x >= 0 && puerto.x + puerto.w <= panel.w, `el puerto ${puerto.n} se sale de ancho`);
    assert.ok(puerto.y + puerto.h <= panel.h, `el puerto ${puerto.n} se sale de alto`);
  }
  assert.equal(panel.puertos[0].y, panel.puertos[11].y, "los 12 primeros comparten fila");
  assert.notEqual(panel.puertos[0].y, panel.puertos[12].y, "el 13 baja de fila");
});

test("abrir una tarjeta de R2 no mueve las zonas que quedan a su izquierda", () => {
  const cerrado = construirLayout(real());
  const abierto = construirLayout(real(), new Set(["eq:R2-PP2"]));
  const antes = new Map(cerrado.nodos.map(nodo => [nodo.id, nodo.x]));
  for (const nodo of abierto.nodos) {
    if (nodo.zona !== "R1") continue;
    assert.equal(nodo.x, antes.get(nodo.id), `${nodo.id} se movió`);
  }
});

test("abrir una tarjeta empuja a la derecha las zonas siguientes, no las pisa", () => {
  const cerrado = construirLayout(real());
  const abierto = construirLayout(real(), new Set(["eq:R2-PP2"]));
  const antes = cerrado.zonas.find(zona => zona.id === "R3");
  const despues = abierto.zonas.find(zona => zona.id === "R3");
  assert.ok(antes && despues);
  assert.ok(despues.x > antes.x, `R3 debía correrse: antes ${antes.x}, después ${despues.x}`);
});

// El bug del pantallazo: R1/SW1 abierta medía 456 de ancho pero la rejilla
// avanzaba 212, así que la zona R1 se dibujaba encima de la R2.
test("con cualquier tarjeta abierta las zonas siguen sin solaparse", () => {
  const conRejilla = construirLayout(real()).nodos.filter(nodo => nodo.clase === "equipo");
  assert.ok(conRejilla.length > 0);
  for (const carta of conRejilla) {
    const layout = construirLayout(real(), new Set([carta.id]));
    const racks = layout.zonas.filter(zona => zona.id !== ZONA_BORDE).sort((a, b) => a.x - b.x);
    for (let i = 1; i < racks.length; i += 1) {
      const previa = racks[i - 1];
      assert.ok(
        racks[i].x >= previa.x + previa.w,
        `con ${carta.id} abierta, ${previa.id} (hasta ${previa.x + previa.w}) pisa a ${racks[i].id} (desde ${racks[i].x})`,
      );
    }
  }
});

test("con una tarjeta abierta cada nodo sigue cabiendo en su zona", () => {
  const layout = construirLayout(real(), new Set(["eq:R1-SW1"]));
  const porId = new Map(layout.zonas.map(zona => [zona.id, zona]));
  for (const nodo of layout.nodos) {
    const zona = porId.get(nodo.zona);
    assert.ok(zona, `la zona ${nodo.zona} existe`);
    assert.ok(nodo.x >= zona.x && nodo.x + nodo.w <= zona.x + zona.w, `${nodo.id} se sale de ${zona.id}`);
  }
});

test("el ancla de un puerto de tarjeta cerrada cae en el centro de la tarjeta", () => {
  const layout = construirLayout(real());
  const anclas = anclasDeLayout(layout);
  const panel = layout.nodos.find(nodo => nodo.id === "eq:R2-PP2");
  assert.ok(panel);
  assert.deepEqual(anclas.get("pto:R2-PP2-p7"), { x: panel.x + panel.w / 2, y: panel.y + panel.h / 2 });
});

test("al abrirla, el ancla del puerto pasa a su propia casilla", () => {
  const layout = construirLayout(real(), new Set(["eq:R2-PP2"]));
  const anclas = anclasDeLayout(layout);
  const panel = layout.nodos.find(nodo => nodo.id === "eq:R2-PP2");
  const puerto = panel?.puertos.find(candidato => candidato.n === 7);
  assert.ok(panel && puerto);
  assert.deepEqual(anclas.get("pto:R2-PP2-p7"), {
    x: panel.x + puerto.x + puerto.w / 2,
    y: panel.y + puerto.y + puerto.h / 2,
  });
});

test("sin orden guardado, ordenarPor respeta el orden automático", () => {
  assert.deepEqual(ordenarPor({}, ["b", "a", "c"]), ["b", "a", "c"]);
});

test("el orden guardado manda sobre el automático", () => {
  assert.deepEqual(ordenarPor({ a: 0, b: 1, c: 2 }, ["c", "b", "a"]), ["a", "b", "c"]);
});

// El caso del equipo agregado después de acomodar el rack: cae al final sin
// desarmar lo que ya se ordenó a mano.
test("lo que no tiene orden guardado va al final, en su orden automático", () => {
  assert.deepEqual(ordenarPor({ c: 0 }, ["a", "b", "c", "d"]), ["c", "a", "b", "d"]);
});

test("un orden guardado de un id que ya no existe no altera la lista", () => {
  assert.deepEqual(ordenarPor({ "eq:BORRADO": 0 }, ["a", "b"]), ["a", "b"]);
});

test("las zonas salen en el orden guardado y el borde sigue primero", () => {
  const estado = real();
  estado.orden = { R3: 0, R2: 1, R1: 2, [ZONA_BORDE]: 0 };
  assert.deepEqual(ordenDeZonas(estado), [ZONA_BORDE, "R3", "R2", "R1"]);
});

const equisDe = (layout: ReturnType<typeof construirLayout>, id: string) =>
  layout.nodos.find(nodo => nodo.id === id)?.x ?? -1;
const yeDe = (layout: ReturnType<typeof construirLayout>, id: string) =>
  layout.nodos.find(nodo => nodo.id === id)?.y ?? -1;

test("dos switches del mismo rack se intercambian sin mover los paneles", () => {
  const base = construirLayout(real());
  const estado = real();
  estado.orden = { "eq:R2-SW3": 0, "eq:R2-SW2": 1, "eq:R2-SW1": 2 };
  const movido = construirLayout(estado);
  assert.ok(equisDe(base, "eq:R2-SW1") < equisDe(base, "eq:R2-SW3"), "el orden de partida es SW1, SW2, SW3");
  assert.ok(equisDe(movido, "eq:R2-SW3") < equisDe(movido, "eq:R2-SW1"), "SW3 quedó a la izquierda de SW1");
  assert.equal(equisDe(movido, "eq:R2-PP1"), equisDe(base, "eq:R2-PP1"), "la fila de paneles no se movió");
});

test("un destino sube dentro de la pila de su equipo", () => {
  const base = construirLayout(real());
  assert.ok(yeDe(base, "esp:utp-e-basica") < yeDe(base, "esp:pie-administrativo"), "el orden de partida");
  const estado = real();
  estado.orden = { "esp:pie-administrativo": 0, "esp:utp-e-basica": 1 };
  const movido = construirLayout(estado);
  assert.ok(yeDe(movido, "esp:pie-administrativo") < yeDe(movido, "esp:utp-e-basica"));
  assert.equal(equisDe(movido, "esp:pie-administrativo"), equisDe(movido, "esp:utp-e-basica"), "siguen en la misma columna");
});

// R2/PP1 sostiene la columna de los espacios y R2/SW1 la del AP. Al mandar el
// panel al final de su fila, su columna pasa a la derecha de la del switch.
test("al mover un panel, la columna de destinos que cuelga de él se mueve con él", () => {
  const base = construirLayout(real());
  assert.ok(equisDe(base, "esp:utp-e-basica") < equisDe(base, "pto:AP-sala-multicopiado-p0"), "el orden de partida");
  const estado = real();
  estado.orden = { "eq:R2-PP2": 0, "eq:R2-PP3": 1, "eq:R2-PP1": 2 };
  const movido = construirLayout(estado);
  assert.ok(equisDe(movido, "pto:AP-sala-multicopiado-p0") < equisDe(movido, "esp:utp-e-basica"));
});

test("los grupos cubren racks, filas y pilas, sin repetir ningún id", () => {
  const layout = construirLayout(real());
  const todos = layout.grupos.flat();
  assert.equal(new Set(todos).size, todos.length, "un id aparece en dos grupos");
  const tiene = (...ids: string[]) => layout.grupos.some(grupo => ids.every(id => grupo.includes(id)));
  assert.ok(tiene("R1", "R2", "R3"), "falta el grupo de racks");
  assert.equal(layout.grupos.some(grupo => grupo.includes(ZONA_BORDE)), false, "la zona de borde no se ordena");
  assert.ok(tiene("eq:R2-SW1", "eq:R2-SW2", "eq:R2-SW3"), "falta la fila de switches de R2");
  assert.ok(tiene("eq:R2-PP1", "eq:R2-PP2", "eq:R2-PP3"), "falta la fila de paneles de R2");
  assert.equal(tiene("eq:R2-SW1", "eq:R2-PP1"), false, "un switch no se ordena contra un panel");
  assert.equal(tiene("eq:R2-SW1", "eq:R3-SW1"), false, "un switch no se ordena contra otro rack");
  assert.ok(tiene("esp:utp-e-basica", "esp:pie-administrativo"), "falta la pila de R2/PP1");
  assert.ok(tiene("pto:FORTINET-p0", "pto:ISP-p0", "pto:MIKROTIK-p0"), "falta la fila de equipos de borde");
});
