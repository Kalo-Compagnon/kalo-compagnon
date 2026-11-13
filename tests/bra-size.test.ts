import { test } from "node:test";
import assert from "node:assert/strict";
import { frenchBraSize } from "../src/bra-size";

test("French bra size follows the Chantelle band and bust grid", () => {
  assert.equal(frenchBraSize(90, 75), "90B");
  assert.equal(frenchBraSize(97, 80), "95C");
  assert.equal(frenchBraSize(101, 75), "90F");
  assert.equal(frenchBraSize(78, 63), "80A");
  assert.equal(frenchBraSize(160, 122), "135J");
});
test("Band boundaries and decimal measurements are rounded consistently", () => {
  assert.equal(frenchBraSize(91, 77.4), "90B");
  assert.equal(frenchBraSize(91, 77.5), "95A");
  assert.equal(frenchBraSize(91.5, 75), "90C");
});
test("Missing, inconsistent and unsupported measurements have no estimated size", () => {
  for (const [bust, under] of [
    [0, 75],
    [90, 0],
    [70, 75],
    [90, 62],
    [150, 123],
    [200, 75],
    [NaN, 75],
    [90, Infinity],
  ]) {
    assert.equal(frenchBraSize(bust, under), null);
  }
});
