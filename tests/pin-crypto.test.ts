import { test } from "node:test";
import assert from "node:assert/strict";
import { decryptPin, encryptPin } from "../lib/pin-crypto.ts";

const conClave = async <T>(clave: string, trabajo: () => Promise<T>): Promise<T> => {
  const anterior = process.env.PIN_ENCRYPTION_KEY;
  process.env.PIN_ENCRYPTION_KEY = clave;
  try {
    return await trabajo();
  } finally {
    if (anterior === undefined) delete process.env.PIN_ENCRYPTION_KEY;
    else process.env.PIN_ENCRYPTION_KEY = anterior;
  }
};

test("un PIN cifrado vuelve idéntico con la misma clave", async () => {
  await conClave("clave-de-prueba-larga", async () => {
    const guardado = await encryptPin("1234");
    assert.deepEqual(await decryptPin(guardado), { ok: true, pin: "1234" });
  });
});

// El campo vacío es un hecho documentado ("este cubículo no tiene PIN"), no un
// fallo: tiene que llegar como éxito para no disparar el aviso de la ficha.
test("un campo vacío es un PIN ausente, no un fallo", async () => {
  await conClave("clave-de-prueba-larga", async () => {
    assert.deepEqual(await decryptPin(""), { ok: true, pin: "" });
  });
});

// El escenario real: cambiar PIN_ENCRYPTION_KEY deja los cifrados anteriores
// ilegibles. Devolviendo "" la ficha decía "Configurado" con el campo en blanco
// y sin explicación, y encima no dejaba guardar porque la validación exige
// 4-64 caracteres.
test("un PIN cifrado con otra clave se reporta ilegible, no vacío", async () => {
  const guardado = await conClave("la-clave-vieja", () => encryptPin("1234"));
  const leido = await conClave("la-clave-nueva", () => decryptPin(guardado));
  assert.deepEqual(leido, { ok: false });
});

test("un valor que no es base64 se reporta ilegible", async () => {
  await conClave("clave-de-prueba-larga", async () => {
    assert.deepEqual(await decryptPin("esto no es base64 ###"), { ok: false });
  });
});

test("un base64 válido pero demasiado corto para el IV se reporta ilegible", async () => {
  await conClave("clave-de-prueba-larga", async () => {
    assert.deepEqual(await decryptPin(btoa("corto")), { ok: false });
  });
});
