import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidIpv4, isValidMac, isValidPin } from "../lib/room-validation.ts";

test("la MAC exige exactamente seis octetos", () => {
  assert.equal(isValidMac("1C-83-41-1C-7D-A7"), true);
  assert.equal(isValidMac("1C-83-41-1C-7D-A7-FF"), false);
  assert.equal(isValidMac("1C-83-41-1C-7D"), false);
  assert.equal(isValidMac(""), true);
});

test("la IPv4 valida cuatro octetos entre 0 y 255", () => {
  assert.equal(isValidIpv4("192.168.1.101"), true);
  assert.equal(isValidIpv4(" 192.168.1.101 "), true);
  assert.equal(isValidIpv4("192.168.1.256"), false);
  assert.equal(isValidIpv4("192.168.1"), false);
});

test("el PIN acepta de 4 a 64 caracteres sin espacios", () => {
  assert.equal(isValidPin("1234"), true);
  assert.equal(isValidPin("abc 123"), false);
  assert.equal(isValidPin("123"), false);
});
