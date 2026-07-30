import { test } from "node:test";
import assert from "node:assert/strict";
import { apiErrorResponse, noStoreJson, readJson } from "../lib/api-response.ts";

function capturarConsoleError() {
  const original = console.error;
  const lineas: string[] = [];
  console.error = (...datos: unknown[]) => { lineas.push(datos.map(String).join(" ")); };
  return { lineas, restaurar: () => { console.error = original; } };
}

test("las respuestas privadas desactivan el almacenamiento en caché", async () => {
  const response = noStoreJson({ ok: true });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true });
});

test("un error interno no expone su mensaje al cliente", async () => {
  const response = apiErrorResponse(new Error("password authentication failed for host db.internal"), "No fue posible guardar.");
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "No fue posible guardar." });
});

test("un cuerpo JSON malformado se informa como solicitud inválida", async () => {
  const request = new Request("https://app.local/api", { method: "POST", body: "{" });
  const error = await readJson(request).catch(cause => cause);
  const response = apiErrorResponse(error, "No fue posible guardar.");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "El cuerpo de la solicitud no contiene JSON válido." });
});

// El cliente sólo ve el texto genérico, así que sin esta traza un fallo real
// (una tabla que falta, por ejemplo) no deja rastro en ninguna parte.
test("un error interno queda registrado en el servidor", () => {
  const consola = capturarConsoleError();
  try {
    apiErrorResponse(new Error('relation "net_orden" does not exist'), "No fue posible cargar la red.");
  } finally {
    consola.restaurar();
  }
  assert.equal(consola.lineas.length, 1);
  assert.match(consola.lineas[0], /net_orden/);
});

test("un cuerpo JSON malformado no ensucia el registro del servidor", async () => {
  const request = new Request("https://app.local/api", { method: "POST", body: "{" });
  const error = await readJson(request).catch(cause => cause);
  const consola = capturarConsoleError();
  try {
    apiErrorResponse(error, "No fue posible guardar.");
  } finally {
    consola.restaurar();
  }
  assert.deepEqual(consola.lineas, []);
});
