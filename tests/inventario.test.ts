import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture-red.ts";
import type { EstadoRed } from "../lib/red/modelo.ts";
import {
  codigoEquipo,
  codigoRack,
  enumerar,
  equiposDeRack,
  idPuerto,
  limpiarNotaRack,
  pareceIp,
  pareceSegmento,
  planCambioPuertos,
  planEliminarEquipo,
  planEliminarRack,
} from "../lib/red/inventario.ts";

// El fixture es deliberadamente escaso: a R2-PP1 le declara 24 puertos pero solo
// trae tres filas. Sirve para trazado y borrado, no para el cambio de cantidad,
// que necesita un equipo con sus puertos completos.
const conPuertos = (total: number, conectados: number[] = []): EstadoRed => {
  const estado = fixture();
  estado.equipos = [{ id: "SW", rack: "R2", tipo: "switch", etiqueta: "Switch", marca: "", modelo: "", ipGestion: "", puertos: total, color: "", x: 0, y: 0, nota: "" }];
  estado.puertos = Array.from({ length: total }, (_, indice) => ({
    id: `pto:SW-p${indice + 1}`, equipo: "SW", n: indice + 1, estado: "libre" as const, nota: "",
  }));
  estado.enlaces = conectados.map((n, indice) => ({
    id: indice + 1, a: `pto:SW-p${n}`, b: "esp:secretaria", tipo: "roseta" as const, nota: "",
  }));
  return estado;
};

const conPuntoUnico = (conectado: boolean): EstadoRed => {
  const estado = fixture();
  estado.equipos = [{ id: "FW", rack: "R2", tipo: "firewall", etiqueta: "Fortinet", marca: "", modelo: "", ipGestion: "", puertos: 0, color: "", x: 0, y: 0, nota: "" }];
  estado.puertos = [{ id: "pto:FW-p0", equipo: "FW", n: 0, estado: "libre", nota: "" }];
  estado.enlaces = conectado ? [{ id: 1, a: "pto:FW-p0", b: "esp:secretaria", tipo: "borde", nota: "" }] : [];
  return estado;
};

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

test("codigoRack toma el primer número libre", () => {
  assert.equal(codigoRack(new Set(["R1", "R2", "R3"])), "R4");
  assert.equal(codigoRack(new Set(["R1", "R3"])), "R2");
  assert.equal(codigoRack(new Set()), "R1");
});

test("codigoEquipo numera por rack y por tipo sin chocar", () => {
  const existentes = new Set(["R3-PP1", "R3-PP2", "R3-SW1"]);
  assert.equal(codigoEquipo("R3", "patchpanel", "Patch Panel 3Z", existentes), "R3-PP3");
  assert.equal(codigoEquipo("R3", "switch", "Switch 2", existentes), "R3-SW2");
  assert.equal(codigoEquipo("R1", "switch", "Switch 1", existentes), "R1-SW1");
});

test("codigoEquipo sin rack usa la sigla y el nombre", () => {
  assert.equal(codigoEquipo("", "ap", "AP Biblioteca", new Set()), "AP-ap-biblioteca");
  assert.equal(codigoEquipo("", "firewall", "Fortinet borde", new Set()), "FW-fortinet-borde");
});

test("codigoEquipo sin rack no pisa un id existente", () => {
  assert.equal(codigoEquipo("", "ap", "AP Biblioteca", new Set(["AP-ap-biblioteca"])), "AP-ap-biblioteca-2");
});

test("idPuerto no rellena con ceros", () => {
  assert.equal(idPuerto("R1-SW1", 1), "pto:R1-SW1-p1");
  assert.equal(idPuerto("R1-SW1", 10), "pto:R1-SW1-p10");
  assert.equal(idPuerto("MIKROTIK", 0), "pto:MIKROTIK-p0");
});

test("enumerar arma listas legibles en español", () => {
  assert.equal(enumerar(["p18"]), "p18");
  assert.equal(enumerar(["p18", "p22"]), "p18 y p22");
  assert.equal(enumerar(["p18", "p22", "p24"]), "p18, p22 y p24");
});

test("planCambioPuertos crea los que faltan al subir", () => {
  const plan = planCambioPuertos(conPuertos(24), "SW", 26);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.crear, [25, 26]);
  assert.deepEqual(plan.borrar, []);
});

test("planCambioPuertos borra los sobrantes libres al bajar", () => {
  const plan = planCambioPuertos(conPuertos(24), "SW", 22);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.borrar, ["pto:SW-p23", "pto:SW-p24"]);
  assert.deepEqual(plan.crear, []);
});

test("planCambioPuertos rechaza bajar sobre puertos con conexiones", () => {
  const plan = planCambioPuertos(conPuertos(24, [18, 22]), "SW", 12);
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.match(plan.error, /p18 y p22/);
  assert.match(plan.error, /conservan conexiones/);
});

test("planCambioPuertos pasa de punto único a puertos numerados", () => {
  const plan = planCambioPuertos(conPuntoUnico(false), "FW", 4);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.crear, [1, 2, 3, 4]);
  assert.deepEqual(plan.borrar, ["pto:FW-p0"]);
});

test("planCambioPuertos no descarta un punto único que conserva conexiones", () => {
  assert.equal(planCambioPuertos(conPuntoUnico(true), "FW", 4).ok, false);
});

test("planCambioPuertos vuelve a punto único al bajar a cero", () => {
  const plan = planCambioPuertos(conPuertos(2), "SW", 0);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.crear, [0]);
  assert.deepEqual(plan.borrar, ["pto:SW-p1", "pto:SW-p2"]);
});

test("planCambioPuertos valida el rango y el equipo", () => {
  assert.equal(planCambioPuertos(conPuertos(24), "NO-EXISTE", 8).ok, false);
  assert.equal(planCambioPuertos(conPuertos(24), "SW", -1).ok, false);
  assert.equal(planCambioPuertos(conPuertos(24), "SW", 97).ok, false);
});

test("planCambioPuertos sin cambios no hace nada", () => {
  const plan = planCambioPuertos(conPuertos(24), "SW", 24);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.crear, []);
  assert.deepEqual(plan.borrar, []);
});

test("planEliminarEquipo arrastra sus puertos y los enlaces de esos puertos", () => {
  const plan = planEliminarEquipo(fixture(), "R2-PP1");
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.puertos, ["pto:R2-PP1-p14", "pto:R2-PP1-p15", "pto:R2-PP1-p16"]);
  assert.deepEqual(plan.enlaces.sort((a, b) => a - b), [1, 2]);
});

test("planEliminarEquipo rechaza un id que no existe", () => {
  assert.equal(planEliminarEquipo(fixture(), "NO-EXISTE").ok, false);
});

test("planEliminarRack arrastra equipos, puertos y enlaces del rack completo", () => {
  const plan = planEliminarRack(fixture(), "R2");
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.equipos.sort(), ["ISP", "MIKROTIK", "R2-PP1", "R2-SW1"]);
  assert.equal(plan.puertos.length, 7);
  assert.deepEqual(plan.enlaces.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test("planEliminarRack rechaza un rack que no existe", () => {
  assert.equal(planEliminarRack(fixture(), "R9").ok, false);
});

test("planEliminarRack de un rack vacío no arrastra nada", () => {
  const estado = fixture();
  estado.racks.push({ id: "R4", nombre: "Rack 4", ubicacion: "", segmento: "", x: 0, y: 0, w: 0, h: 0, notas: "" });
  const plan = planEliminarRack(estado, "R4");
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.equipos, []);
  assert.deepEqual(plan.puertos, []);
  assert.deepEqual(plan.enlaces, []);
});

test("equiposDeRack cae al orden por y cuando no hay orden manual", () => {
  const ids = equiposDeRack(fixture(), "R2").map(equipo => equipo.id);
  assert.deepEqual(ids, ["ISP", "MIKROTIK", "R2-PP1", "R2-SW1"]);
});

test("equiposDeRack respeta el orden manual guardado", () => {
  const estado = fixture();
  estado.orden = { "R2-SW1": 0, "R2-PP1": 1 };
  const ids = equiposDeRack(estado, "R2").map(equipo => equipo.id);
  assert.deepEqual(ids.slice(0, 2), ["R2-SW1", "R2-PP1"]);
});

test("equiposDeRack incluye los equipos sin puertos numerados", () => {
  const ids = equiposDeRack(fixture(), "R2").map(equipo => equipo.id);
  assert.ok(ids.includes("MIKROTIK"));
  assert.ok(ids.includes("ISP"));
});
