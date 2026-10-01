import { test } from "node:test";
import assert from "node:assert/strict";
import fixtures from "./android-float-fixtures.json";
import { calculateBasal, nutrients, activity, seedFoods } from "../src/domain";
test("Parité exacte sur 3 000 résultats calculés par Java (IEEE754 Float Android)", () => {
  for (const v of fixtures) {
    assert.equal(
      nutrients({ ...seedFoods[0], kcalPer100: v.rate }, v.quantity)[0],
      v.calories,
    );
    assert.equal(calculateBasal(v.sex, v.age, v.height, v.weight), v.basal);
    assert.equal(
      activity({
        steps: v.steps - 300,
        fitCoveredSteps: v.covered,
        fitCalories: v.fit,
      }),
      v.activity,
    );
  }
});
