import { test } from "node:test";
import assert from "node:assert/strict";
import { unaVezPorClave } from "../lib/una-vez.ts";

test("el trabajo se ejecuta una sola vez para la misma clave", async () => {
  let veces = 0;
  const preparar = unaVezPorClave(async () => { veces += 1; return "listo"; });

  assert.deepEqual(await Promise.all([preparar("a"), preparar("a")]), ["listo", "listo"]);
  await preparar("a");

  assert.equal(veces, 1);
});

// Sin esto un arranque fallido queda memorizado y envenena al servidor entero:
// todas las peticiones siguientes reciben el mismo rechazo hasta reiniciarlo.
test("un fallo no se memoriza y el siguiente intento vuelve a ejecutarse", async () => {
  let veces = 0;
  const preparar = unaVezPorClave(async () => {
    veces += 1;
    if (veces === 1) throw new Error("conexión rechazada");
    return "listo";
  });

  await assert.rejects(preparar("a"), /conexión rechazada/);

  assert.equal(await preparar("a"), "listo");
  assert.equal(veces, 2);
});

// La clave es el DATABASE_URL: si cambia, el trabajo hecho para el anterior
// (crear las tablas) no dice nada sobre la base nueva.
test("una clave distinta vuelve a ejecutar el trabajo", async () => {
  const usadas: string[] = [];
  const preparar = unaVezPorClave(async (clave: string) => { usadas.push(clave); return clave; });

  await preparar("base-vieja");
  await preparar("base-nueva");
  await preparar("base-nueva");

  assert.deepEqual(usadas, ["base-vieja", "base-nueva"]);
});
