import { test } from "node:test";
import assert from "node:assert/strict";
import { apiErrorResponse, noStoreJson, readJson } from "../lib/api-response.ts";

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
