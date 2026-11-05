import test from "node:test";
import assert from "node:assert/strict";
import { sharedCalorieScale, calorieHeights } from "../src/duo-calorie-scale";

test("Duo : une échelle commune conserve les écarts de calories", () => {
  const small = { intake: 1000, spent: 1500 },
    large = { intake: 2000, spent: 3000 };
  const scale = sharedCalorieScale([[small], [large]]);
  assert.equal(scale.maximum, 5000);
  const left = calorieHeights(small, scale.maximum, 154),
    right = calorieHeights(large, scale.maximum, 154);
  assert.equal(right.total, 2 * left.total);
  assert.equal(right.intake, 2 * left.intake);
  assert.equal(right.total, 154);
  assert.deepEqual(calorieHeights(small, scale.maximum, 154), left);
});
test("Duo : deux repères à 50 % des maxima personnels de la période", () => {
  const scale = sharedCalorieScale([
    [
      { intake: 1000, spent: 1500 },
      { intake: 800, spent: 1200 },
    ],
    [{ intake: 2000, spent: 3000 }],
  ]);
  assert.deepEqual(scale.halfReferences, [1250, 2500]);
});
test("Duo : une série absente ne crée ni calories ni repère", () => {
  assert.deepEqual(sharedCalorieScale([[], []]), {
    maximum: 1,
    halfReferences: [null, null],
  });
  assert.deepEqual(sharedCalorieScale([[], [{ intake: 0, spent: 2000 }]]), {
    maximum: 2000,
    halfReferences: [null, 1000],
  });
});
