import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture-red.ts";
import { etiquetaCategoria, etiquetaEndpoint, etiquetaPuerto, existeEndpoint, ID_SALA_COMPUTACION, idDisponible, ordenCanonico, planEliminarEspacio, prefijoDe, slugificar, validarEnlace, validarNombreCategoria } from "../lib/red/modelo.ts";

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

test("validarEnlace permite documentar ISP a Fortinet aunque sus puntos estén ocupados", () => {
  const estado = fixture();
  estado.equipos.push({ id: "FORTINET", rack: "", tipo: "firewall", etiqueta: "Fortinet", marca: "", modelo: "", ipGestion: "", puertos:0, color: "", x: 0, y: 0, nota: "" });
  estado.puertos.push({ id: "pto:FORTINET-p0", equipo: "FORTINET", n: 0, estado: "ocupado", nota: "" });

  assert.deepEqual(validarEnlace(estado, "pto:ISP-p0", "pto:FORTINET-p0"), { ok: true });
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

test("slugificar quita acentos y colapsa lo que no sea alfanumérico", () => {
  assert.equal(slugificar("Laboratorio de Ciencias"), "laboratorio-de-ciencias");
  assert.equal(slugificar("  Área ñoña  "), "area-nona");
  assert.equal(slugificar("¿?¡!"), "nuevo");
  assert.equal(slugificar("¿?¡!", ""), "");
});

test("idDisponible agrega sufijo solo cuando el id base ya está tomado", () => {
  assert.equal(idDisponible("sala", new Set()), "sala");
  assert.equal(idDisponible("sala", new Set(["sala"])), "sala-2");
  assert.equal(idDisponible("sala", new Set(["sala", "sala-2"])), "sala-3");
});

test("validarNombreCategoria rechaza el vacío y lo que no deja slug", () => {
  const categorias = fixture().categorias;
  assert.equal(validarNombreCategoria(categorias, "   ").ok, false);
  const simbolos = validarNombreCategoria(categorias, "¿?");
  assert.equal(simbolos.ok, false);
  assert.match(simbolos.ok === false ? simbolos.error : "", /letra o número/);
});

test("validarNombreCategoria rechaza el nombre repetido sin importar mayúsculas", () => {
  const categorias = fixture().categorias;
  const repetido = validarNombreCategoria(categorias, "  sala  ");
  assert.equal(repetido.ok, false);
  assert.match(repetido.ok === false ? repetido.error : "", /Ya existe/);
});

test("validarNombreCategoria deja renombrar una categoría a su propio nombre", () => {
  const categorias = fixture().categorias;
  assert.deepEqual(validarNombreCategoria(categorias, "Sala", "sala"), { ok: true, nombre: "Sala" });
  assert.deepEqual(validarNombreCategoria(categorias, " Laboratorio ", "sala"), { ok: true, nombre: "Laboratorio" });
});

test("etiquetaCategoria cae al id cuando el tipo ya no existe", () => {
  const estado = fixture();
  assert.equal(etiquetaCategoria(estado, "oficina"), "Oficina");
  assert.equal(etiquetaCategoria(estado, "fantasma"), "fantasma");
});

test("planEliminarEspacio protege la Sala de Computación", () => {
  const estado = fixture();
  estado.espacios.push({ id: ID_SALA_COMPUTACION, nombre: "Sala de Computación", ubicacion: "", categoria: "sala", estado: "operativo", x: 0, y: 0, nota: "", testigoMac: "" });
  const plan = planEliminarEspacio(estado, ID_SALA_COMPUTACION);
  assert.equal(plan.ok, false);
  assert.match(plan.ok === false ? plan.error : "", /no se puede eliminar/i);
});

test("planEliminarEspacio rechaza ids que no son espacios o que ya no están", () => {
  const estado = fixture();
  assert.equal(planEliminarEspacio(estado, "pto:R2-PP1-p14").ok, false);
  assert.equal(planEliminarEspacio(estado, "esp:no-existe").ok, false);
});

test("planEliminarEspacio lista los enlaces del espacio y libera su puerto", () => {
  const estado = fixture();
  // Un puerto de roseta que solo sirve a esta sala: al borrarla queda libre.
  estado.espacios.push({ id: "esp:vecina", nombre: "Vecina", ubicacion: "", categoria: "sala", estado: "operativo", x: 0, y: 0, nota: "", testigoMac: "" });
  estado.puertos.push({ id: "pto:R2-PP1-p20", equipo: "R2-PP1", n: 20, estado: "ocupado", nota: "" });
  estado.enlaces.push({ id: 9, a: "esp:vecina", b: "pto:R2-PP1-p20", tipo: "roseta", nota: "" });

  const plan = planEliminarEspacio(estado, "esp:vecina");
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.enlaces, [9]);
  assert.deepEqual(plan.puertosALiberar, ["pto:R2-PP1-p20"]);
});

// El panel sigue parcheado al switch aunque la sala desaparezca: liberar ese
// puerto dejaría el enlace 2 apuntando a un puerto marcado como libre.
test("planEliminarEspacio no libera un puerto que sigue sirviendo a otro enlace", () => {
  const estado = fixture();
  const plan = planEliminarEspacio(estado, "esp:3-basico-b");
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.enlaces, [1]);
  assert.deepEqual(plan.puertosALiberar, []);
});

test("planEliminarEspacio acepta un espacio sin conexiones", () => {
  const estado = fixture();
  assert.deepEqual(planEliminarEspacio(estado, "esp:secretaria"), { ok: true, enlaces: [], puertosALiberar: [] });
});
