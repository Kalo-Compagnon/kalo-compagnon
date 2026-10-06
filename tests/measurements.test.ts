import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../src/domain";
import { Repository } from "../src/persistence";
import {
  currentMeasurements,
  measurementRecords,
  previousMeasurement,
  measurementDelta,
} from "../src/measurement-history";
test("Mensurations : anciennes dates, relevés partiels et comparaison par zone", () => {
  const s = initialState();
  s.days["2026-10-01"] = { measurements: { Poitrine: 95, Taille: 80 } };
  s.days["2026-10-02"] = { measurements: { Taille: 79.5 } };
  s.days["2026-10-03"] = { measurements: { Poitrine: 96 } };
  assert.deepEqual(currentMeasurements(s, "2026-10-04"), {
    Poitrine: 96,
    Taille: 79.5,
  });
  assert.equal(currentMeasurements(s, "2026-10-01").Poitrine, 95);
  const records = measurementRecords(s, "2026-10-04");
  assert.equal(
    measurementDelta(96, previousMeasurement(records, 2, "Poitrine")),
    "↑ +1 cm",
  );
  assert.equal(measurementDelta(79.5, 80), "↓ −0,5 cm");
  assert.equal(measurementDelta(80, 80), "→ 0 cm");
  assert.equal(measurementDelta(80), "Premier relevé");
  s.days["2026-10-04"] = { measurements: { Poitrine: 0 } };
  assert.equal(currentMeasurements(s, "2026-10-04").Poitrine, 0);
  assert.equal(currentMeasurements(s, "2026-10-05").Poitrine, 0);
});
test("Mensurations : sauvegarder un relevé ne duplique pas le brouillon partiel", () => {
  const s = initialState();
  s.days["2026-10-01"] = { measurements: { Poitrine: 95, Taille: 80 } };
  s.days["2026-10-02"] = {
    measurements: { Poitrine: 96 },
    measurementHistory: [
      {
        timestamp: new Date("2026-10-02T12:00:00").getTime(),
        values: { Poitrine: 96, Taille: 80 },
      },
    ],
  };
  assert.equal(measurementRecords(s, "2026-10-02").length, 2);
});
test("Mensurations : migration des anciennes données et rechargement IndexedDB", async () => {
  const r = new Repository(null);
  await r.load("measurement-reload");
  r.docs = [
    {
      key: "day/2026-10-01",
      value: { measurements: { Poitrine: 95 }, steps: 1200 },
      revision: 1,
      pending: false,
    },
  ];
  await r.update((s) => {
    s.days["2026-10-02"] = { measurements: { Poitrine: 96 } };
  });
  assert.ok(r.docs.some((d) => d.key === "measurement/2026-10-01/Poitrine"));
  const reboot = new Repository(null);
  await reboot.load("measurement-reload");
  assert.equal(currentMeasurements(reboot.state, "2026-10-03").Poitrine, 96);
  assert.equal(reboot.state.days["2026-10-01"].steps, 1200);
});
