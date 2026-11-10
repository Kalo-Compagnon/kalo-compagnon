import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Repository } from "../src/persistence";
import { initialState } from "../src/domain";
import { selectableFood } from "../src/food-search";

test("Catalogue : suppression commune avec conservation des fiches historiques", async () => {
  const cloud = backend(),
    a = new Repository(cloud.client("delete-a")),
    b = new Repository(cloud.client("delete-b"));
  await a.load("delete-a");
  await b.load("delete-b");
  await a.update((s) => {
    s.foods.push(custom("to-delete"));
  });
  await a.sync();
  await b.sync();
  await a.update((s) => {
    s.foods.find((f) => f.id === "to-delete")!.isDeleted = true;
  });
  await a.sync();
  await b.sync();
  const archived = b.state.foods.find((f) => f.id === "to-delete")!;
  assert.equal(archived.isDeleted, true);
  assert.equal(selectableFood(archived), false);
  assert.equal(cloud.catalogue.get("to-delete")!.value.isDeleted, true);
  await b.update((s) => {
    s.foods.find((f) => f.id === "to-delete")!.isDeleted = false;
  });
  await b.sync();
  await a.sync();
  assert.equal(
    a.state.foods.find((f) => f.id === "to-delete")!.isDeleted,
    false,
  );
});
function backend() {
  type Row = { value: any; revision: number };
  const privateRows = new Map<string, Map<string, Row>>();
  const catalogue = new Map<string, Row>();
  let offline = false,
    installed = true;
  return {
    catalogue,
    privateRows,
    offline(value: boolean) {
      offline = value;
    },
    installed(value: boolean) {
      installed = value;
    },
    client(uid: string) {
      const personal = privateRows.get(uid) ?? new Map<string, Row>();
      privateRows.set(uid, personal);
      return {
        from(table: string) {
          const shared = table === "logger_food_catalog";
          return {
            select() {
              return this;
            },
            eq(_key: string, _id: string) {
              return this;
            },
            order() {
              return this;
            },
            async range(first: number, last: number) {
              if (table === "logger_meal_catalog") return { data: [], error: null };
              if (offline || (shared && !installed))
                return { data: null, error: new Error("Unavailable") };
              const rows = [...(shared ? catalogue : personal)]
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(first, last + 1)
                .map(([id, row]) => ({
                  ...(shared ? { id } : { key: id }),
                  ...structuredClone(row),
                }));
              return { data: rows, error: null };
            },
          };
        },
        async rpc(
          name: string,
          params: {
            p_id?: string;
            p_key?: string;
            p_value: unknown;
            p_revision: number;
          },
        ) {
          const shared = name === "logger_catalog_put",
            map = shared ? catalogue : personal;
          if (offline || (shared && !installed))
            return { data: null, error: new Error("Unavailable") };
          const id = (shared ? params.p_id : params.p_key)!;
          const old = map.get(id);
          if ((old?.revision ?? 0) !== params.p_revision)
            return {
              data: {
                accepted: false,
                revision: old?.revision ?? 0,
                value: structuredClone(old?.value ?? null),
              },
              error: null,
            };
          const revision = (old?.revision ?? 0) + 1;
          map.set(id, { value: structuredClone(params.p_value), revision });
          return { data: { accepted: true, revision }, error: null };
        },
      } as unknown as SupabaseClient;
    },
  };
}
const custom = (id: string) => ({
  ...initialState().foods[0],
  id,
  name: "Produit utilisateur",
  isCustom: true,
  subtype: "Vanille",
});

test("Catalogue commun entre comptes, préférences et journal privés, cache après redémarrage", async () => {
  const cloud = backend(),
    a = new Repository(cloud.client("a")),
    b = new Repository(cloud.client("b"));
  await a.load("catalog-a");
  await b.load("catalog-b");
  await a.update((s) => {
    s.foods.push({
      ...custom("shared-one"),
      isFavorite: true,
      usageCount: 9,
      lastUsedAt: 123,
    });
    s.entries.push({
      id: "private",
      timestamp: 1,
      type: "food",
      foodName: "Privé",
      calories: 123,
    });
  });
  await a.sync();
  await b.sync();
  const food = b.state.foods.find((f) => f.id === "shared-one")!;
  assert.equal(food.name, "Produit utilisateur");
  assert.equal(food.subtype, "Vanille");
  assert.equal(food.isFavorite, false);
  assert.equal(food.usageCount, 0);
  assert.equal(food.lastUsedAt, undefined);
  assert.equal(b.state.entries.length, 0);
  assert.ok(!("isFavorite" in cloud.catalogue.get(food.id)!.value));
  assert.ok(!("lastUsedAt" in cloud.catalogue.get(food.id)!.value));
  await b.update((s) => {
    s.settings.deficitGoal = 700;
  });
  assert.ok(!b.docs.some((d) => d.key === `food/${food.id}`));
  await b.update((s) => {
    s.foods.find((f) => f.id === food.id)!.isFavorite = true;
  });
  await b.sync();
  assert.equal(cloud.catalogue.get(food.id)!.revision, 1);
  await b.update((s) => {
    s.foods.find((f) => f.id === food.id)!.kcalPer100 = 234;
  });
  await b.sync();
  await a.sync();
  assert.equal(a.state.foods.find((f) => f.id === food.id)!.kcalPer100, 234);
  assert.equal(a.state.foods.find((f) => f.id === food.id)!.usageCount, 9);
  assert.equal(a.state.entries[0].calories, 123);
  const restarted = new Repository(cloud.client("b"));
  await restarted.load("catalog-b");
  assert.equal(
    restarted.state.foods.find((f) => f.id === food.id)!.isFavorite,
    true,
  );
  await restarted.load("guest");
  assert.ok(!restarted.state.foods.some((f) => f.id === food.id));
});

test("Catalogue : création hors ligne, reprise et modifications concurrentes sans écrasement", async () => {
  const cloud = backend(),
    a = new Repository(cloud.client("c")),
    b = new Repository(cloud.client("d"));
  await a.load("catalog-c");
  await b.load("catalog-d");
  cloud.offline(true);
  await a.update((s) => {
    s.foods.push(custom("offline-food"));
  });
  await a.sync();
  assert.equal(cloud.catalogue.size, 0);
  cloud.offline(false);
  await a.sync();
  await b.sync();
  await a.update((s) => {
    s.foods.find((f) => f.id === "offline-food")!.name = "Version A";
  });
  await b.update((s) => {
    s.foods.find((f) => f.id === "offline-food")!.name = "Version B";
  });
  await a.sync();
  await b.sync();
  const conflict = b.docs.find((d) => d.key === "catalog/offline-food")!;
  assert.equal((conflict.value as any).name, "Version B");
  assert.equal((conflict.conflict?.value as any).name, "Version A");
  assert.equal(cloud.catalogue.get("offline-food")!.value.name, "Version A");
  await b.resolve(conflict.key, false);
  await a.sync();
  assert.equal(
    a.state.foods.find((f) => f.id === "offline-food")!.name,
    "Version B",
  );
});

test("Catalogue indisponible : les documents privés continuent à se synchroniser", async () => {
  const cloud = backend(),
    a = new Repository(cloud.client("e"));
  await a.load("catalog-e");
  cloud.installed(false);
  await a.update((s) => {
    s.foods.push(custom("pending-food"));
    s.settings.deficitGoal = 650;
  });
  await a.sync();
  assert.equal(
    cloud.privateRows.get("e")!.get("settings/deficitGoal")!.value,
    650,
  );
  assert.equal(
    a.docs.find((d) => d.key === "catalog/pending-food")!.pending,
    true,
  );
  cloud.installed(true);
  await a.sync();
  assert.ok(cloud.catalogue.has("pending-food"));
});

test("Catalogue : publication des créations existantes sans les aliments prédéfinis", async () => {
  const cloud = backend(),
    a = new Repository(cloud.client("f"));
  await a.load("catalog-f");
  a.docs = [
    {
      key: "food/existing",
      value: custom("existing"),
      pending: false,
      revision: 1,
    },
  ];
  await a.sync();
  assert.deepEqual([...cloud.catalogue.keys()], ["existing"]);
});

test("Catalogue : toutes les pages et anciennes modifications hors ligne sont conservées", async () => {
  const cloud = backend(),
    repo = new Repository(cloud.client("pages"));
  for (let i = 0; i < 501; i++)
    cloud.catalogue.set(`item-${i}`, {
      value: custom(`item-${i}`),
      revision: 1,
    });
  await repo.load("catalog-pages");
  repo.docs = [
    {
      key: "food/item-0",
      value: { ...custom("item-0"), name: "Ancien brouillon hors ligne" },
      pending: true,
      revision: 0,
    },
  ];
  await repo.sync();
  assert.equal(repo.state.foods.filter((f) => f.isCustom).length, 501);
  const pending = repo.docs.find((d) => d.key === "catalog/item-0")!;
  assert.ok(pending.conflict);
  assert.equal(
    repo.state.foods.find((f) => f.id === "item-0")!.name,
    "Ancien brouillon hors ligne",
  );
  await repo.resolve(pending.key, true);
  assert.equal(
    repo.state.foods.find((f) => f.id === "item-0")!.name,
    "Produit utilisateur",
  );
});
