import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPAS, capaDeEquipo } from "../lib/red/flujo.ts";

test("cada tipo de equipo cae en su capa", () => {
  assert.equal(capaDeEquipo("isp"), "borde");
  assert.equal(capaDeEquipo("firewall"), "borde");
  assert.equal(capaDeEquipo("router"), "borde");
  assert.equal(capaDeEquipo("switch"), "switches");
  assert.equal(capaDeEquipo("patchpanel"), "patch");
});

// Un AP cuelga de un puerto y no tiene puertos propios que mostrar: es una hoja,
// aunque esté enchufado directo al firewall como AP-cab-enlace.
test("un punto de acceso es siempre un destino", () => {
  assert.equal(capaDeEquipo("ap"), "destinos");
});

test("las capas van del borde a los destinos", () => {
  assert.deepEqual(CAPAS, ["borde", "switches", "patch", "destinos"]);
});
