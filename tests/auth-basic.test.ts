import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirAcceso } from "../lib/auth-basic.ts";

const basic = (usuario: string, clave: string) => `Basic ${Buffer.from(`${usuario}:${clave}`).toString("base64")}`;

// El guardia estaba al revés: sin credenciales y sin VERCEL —el camino normal
// en cabserver— proxy.ts devolvía NextResponse.next() y dejaba el panel y todas
// sus API abiertos, sin aviso y sin log.
test("sin credenciales configuradas no pasa nadie", () => {
  assert.equal(decidirAcceso(basic("quien", "sea"), undefined, undefined), "sin-configurar");
});

test("una credencial a medias tampoco abre la puerta", () => {
  assert.equal(decidirAcceso(basic("enlace-admin", "x"), "enlace-admin", undefined), "sin-configurar");
  assert.equal(decidirAcceso(basic("enlace-admin", "x"), undefined, "x"), "sin-configurar");
});

// Una cadena vacía es "la variable existe pero no dice nada": tratarla como
// configurada dejaría entrar con usuario y clave vacíos.
test("una credencial vacía cuenta como no configurada", () => {
  assert.equal(decidirAcceso(basic("", ""), "", ""), "sin-configurar");
});

test("las credenciales correctas pasan", () => {
  assert.equal(decidirAcceso(basic("enlace-admin", "clave-larga"), "enlace-admin", "clave-larga"), "adelante");
});

test("usuario o clave equivocados se rechazan", () => {
  assert.equal(decidirAcceso(basic("otro", "clave-larga"), "enlace-admin", "clave-larga"), "rechazado");
  assert.equal(decidirAcceso(basic("enlace-admin", "otra"), "enlace-admin", "clave-larga"), "rechazado");
});

test("sin cabecera Authorization se rechaza", () => {
  assert.equal(decidirAcceso(null, "enlace-admin", "clave-larga"), "rechazado");
  assert.equal(decidirAcceso("", "enlace-admin", "clave-larga"), "rechazado");
});

// timingSafeEqual explota si los buffers miden distinto, así que la comparación
// tiene que mirar el largo antes de llamarlo.
test("una cabecera de largo distinto se rechaza sin reventar", () => {
  assert.equal(decidirAcceso("Basic ", "enlace-admin", "clave-larga"), "rechazado");
  assert.equal(decidirAcceso(basic("enlace-admin", "clave-larguísima-de-más"), "enlace-admin", "clave-larga"), "rechazado");
});
