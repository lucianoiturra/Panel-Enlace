import assert from "node:assert/strict";
import test from "node:test";
import {
  etiquetaDias,
  etiquetaObjetivo,
  normalizarDias,
  normalizarObjetivo,
  estadoBoton,
  resumirUltimoEncendido,
  validarPrograma,
  type EventoWol,
} from "../lib/wol/programa.ts";

test("los dias quedan ordenados, sin repetir y sin basura", () => {
  assert.equal(normalizarDias("54321"), "12345");
  assert.equal(normalizarDias("1,1,3"), "13");
  assert.equal(normalizarDias("L y M"), "");
  // 0 y 8 no son dias ISO.
  assert.equal(normalizarDias("089"), "");
});

test("el objetivo acepta 'todos' o cubiculos del 1 al 40", () => {
  assert.equal(normalizarObjetivo("todos"), "todos");
  assert.equal(normalizarObjetivo(""), "todos");
  assert.equal(normalizarObjetivo("7, 3, 3"), "3,7");
  // Fuera de rango no existe como cubiculo: se descarta en vez de guardarse.
  assert.equal(normalizarObjetivo("41,0,-2"), "");
});

test("un horario valido se acepta y queda normalizado", () => {
  const resultado = validarPrograma({ nombre: "  Apertura  ", dias: "54321", hora: "07:45", objetivo: "todos" });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.ok && resultado.valor, {
    nombre: "Apertura", dias: "12345", hora: "07:45", objetivo: "todos", activo: true,
  });
});

test("los horarios invalidos se rechazan con un motivo util", () => {
  const casos: [Record<string, unknown>, string][] = [
    [{ nombre: "", dias: "12345", hora: "07:45" }, "nombre"],
    [{ nombre: "X", dias: "", hora: "07:45" }, "día"],
    [{ nombre: "X", dias: "1", hora: "7:45" }, "HH:MM"],
    [{ nombre: "X", dias: "1", hora: "24:00" }, "HH:MM"],
    [{ nombre: "X", dias: "1", hora: "07:45", objetivo: "99" }, "cubículo"],
  ];
  for (const [entrada, esperado] of casos) {
    const resultado = validarPrograma(entrada);
    assert.equal(resultado.ok, false, `deberia rechazar ${JSON.stringify(entrada)}`);
    assert.ok(!resultado.ok && resultado.error.includes(esperado), `"${!resultado.ok && resultado.error}" deberia mencionar "${esperado}"`);
  }
});

test("los dias corridos se leen como rango", () => {
  assert.equal(etiquetaDias("12345"), "L a V");
  assert.equal(etiquetaDias("1234567"), "todos los días");
  assert.equal(etiquetaDias("67"), "fin de semana");
  assert.equal(etiquetaDias("234"), "M a J");
  assert.equal(etiquetaDias("24"), "M, J");
  assert.equal(etiquetaDias("135"), "L, X, V");
  assert.equal(etiquetaDias(""), "nunca");
});

test("el objetivo se nombra en castellano", () => {
  assert.equal(etiquetaObjetivo("todos"), "toda la sala");
  assert.equal(etiquetaObjetivo("7"), "cubículo 7");
  assert.equal(etiquetaObjetivo("3,7,12"), "3 cubículos");
});

const evento = (cubiculo: number, resultado: string, desperto: boolean | null, minuto: string): EventoWol =>
  ({ cubiculo, resultado, desperto, enviadoAt: `2026-08-12T07:${minuto}:00.000Z` });

test("sin eventos no se inventa un encendido", () => {
  assert.equal(resumirUltimoEncendido([]).hubo, false);
});

test("el resumen dice quien NO desperto, que es lo accionable", () => {
  const resumen = resumirUltimoEncendido([
    evento(3, "enviado", true, "45"),
    evento(7, "enviado", false, "45"),
    evento(12, "enviado", null, "45"),
    evento(20, "ya-encendido", true, "45"),
    evento(27, "enviado", false, "45"),
  ]);
  assert.equal(resumen.hubo, true);
  assert.equal(resumen.enviados, 4);
  assert.equal(resumen.yaEncendidos, 1);
  assert.equal(resumen.despertaron, 1);
  assert.equal(resumen.sinVerificar, 1);
  assert.deepEqual(resumen.dormidos, [7, 27]);
});

// Un envio manual a las 08:00 no tiene por que contaminar el parte del
// programado de las 07:45: son dos encendidos distintos.
test("solo se resume la ultima rafaga, no todo el historial", () => {
  const resumen = resumirUltimoEncendido([
    evento(1, "enviado", false, "00"),
    evento(2, "enviado", false, "05"),
    evento(3, "enviado", true, "45"),
    evento(7, "enviado", false, "46"),
  ]);
  assert.equal(resumen.enviados, 2);
  assert.deepEqual(resumen.dormidos, [7]);
});

// --- el boton de "encender ahora" -------------------------------------------
// Regresion de un caso real: el 2026-08-12 se pidio encender la sala y salieron
// DOS rafagas identicas con 59 s de diferencia. El pedido se marca atendido
// apenas salen los paquetes, asi que el boton volvia a decir "Encender ahora"
// mientras la verificacion seguia corriendo, y apretarlo de nuevo era lo
// natural: no habia pasado nada visible.
const T0 = Date.parse("2026-08-12T12:42:49.000Z");
const enCurso = { hubo: true, cuando: new Date(T0).toISOString(), sinVerificar: 34 };

test("con un pedido en cola el boton no acepta otro", () => {
  assert.deepEqual(estadoBoton(enCurso, { id: 2 }, T0), { puede: false, etiqueta: "En cola…" });
});

test("con la rafaga ya enviada pero sin verificar, el boton espera", () => {
  // Justo el momento en que antes se ofrecia de nuevo: pedido atendido, cero en
  // cola, verificacion todavia corriendo.
  assert.deepEqual(estadoBoton(enCurso, null, T0 + 60_000), { puede: false, etiqueta: "Verificando…" });
  assert.deepEqual(estadoBoton(enCurso, null, T0 + 11 * 60_000), { puede: false, etiqueta: "Verificando…" });
});

test("pasada la ventana, el boton vuelve", () => {
  assert.deepEqual(estadoBoton(enCurso, null, T0 + 13 * 60_000), { puede: true, etiqueta: "Encender ahora" });
});

test("si ya se verifico todo, no hay que esperar la ventana completa", () => {
  const verificado = { hubo: true, cuando: new Date(T0).toISOString(), sinVerificar: 0 };
  assert.deepEqual(estadoBoton(verificado, null, T0 + 60_000), { puede: true, etiqueta: "Encender ahora" });
});

test("sin encendidos previos el boton esta disponible", () => {
  assert.deepEqual(estadoBoton({ hubo: false, cuando: "", sinVerificar: 0 }, null, T0), { puede: true, etiqueta: "Encender ahora" });
});

// Regresion del 2026-08-12: dos pulsaciones del boton con 59 s de diferencia
// generaron dos rafagas identicas. Ambas caian dentro de la ventana de cinco
// minutos, asi que cada cubiculo se contaba dos veces y la pantalla informo
// "68 enviados" sobre 34 equipos, con los dormidos repetidos en pares.
test("dos rafagas seguidas no cuentan cada equipo dos veces", () => {
  const dobles: EventoWol[] = [
    { cubiculo: 12, resultado: "enviado", desperto: false, enviadoAt: "2026-08-12T12:42:49.000Z" },
    { cubiculo: 16, resultado: "enviado", desperto: false, enviadoAt: "2026-08-12T12:42:49.000Z" },
    { cubiculo: 3, resultado: "ya-encendido", desperto: true, enviadoAt: "2026-08-12T12:42:49.000Z" },
    { cubiculo: 12, resultado: "enviado", desperto: false, enviadoAt: "2026-08-12T12:43:48.000Z" },
    { cubiculo: 16, resultado: "enviado", desperto: false, enviadoAt: "2026-08-12T12:43:48.000Z" },
    { cubiculo: 3, resultado: "ya-encendido", desperto: true, enviadoAt: "2026-08-12T12:43:48.000Z" },
  ];
  const resumen = resumirUltimoEncendido(dobles);
  assert.equal(resumen.enviados, 2, "34 equipos no pueden ser 68");
  assert.equal(resumen.yaEncendidos, 1);
  assert.deepEqual(resumen.dormidos, [12, 16], "sin numeros repetidos");
});

// El segundo intento es el que vale: si el equipo desperto recien en la segunda
// rafaga, no puede quedar registrado como dormido por lo que dijo la primera.
test("de un cubiculo manda su noticia mas reciente", () => {
  const resumen = resumirUltimoEncendido([
    { cubiculo: 12, resultado: "enviado", desperto: false, enviadoAt: "2026-08-12T12:42:49.000Z" },
    { cubiculo: 12, resultado: "enviado", desperto: true, enviadoAt: "2026-08-12T12:43:48.000Z" },
  ]);
  assert.equal(resumen.despertaron, 1);
  assert.deepEqual(resumen.dormidos, []);
});
