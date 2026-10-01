import { useState } from "react";
import {
  useApp,
  Sheet,
  Button,
  Field,
  NumberField,
  ActionRow,
  Confirm,
  PhotoInput,
  num,
} from "./ui";
import {
  type Food,
  type Meal,
  type Ingredient,
  type Entry,
  nutrients,
  mealTotals,
  mealEntry,
  normalize,
  fmt,
  timestamp,
} from "./domain";
const categories = [
  "Toutes",
  "Féculents",
  "Pain",
  "Viandes",
  "Charcuteries",
  "Produits laitiers",
  "Fromages",
  "Fruits",
  "Légumes",
  "Sauces",
  "Boissons",
  "Produits sucrés",
  "Snacks",
  "Autres",
];
const macro = (v: number[]) =>
  `${fmt(v[0])} kcal  ·  P ${fmt(v[1])} g  ·  G ${fmt(v[2])} g  ·  L ${fmt(v[3])} g`;
export function ExtraEditor({
  entry,
  defaultName = "Extra",
}: {
  entry?: Entry;
  defaultName?: string;
}) {
  const { day, update, close, notify } = useApp();
  const [name, setName] = useState(entry?.foodName ?? defaultName),
    [note, setNote] = useState(entry?.note ?? ""),
    [cal, setCal] = useState(
      entry?.calories == null ? "" : String(entry.calories),
    ),
    [photo, setPhoto] = useState(entry?.imagePath ?? "");
  return (
    <Sheet
      title={entry ? `Modifier ${entry.foodName}` : "Ajouter un extra"}
      subtitle="Tout peut être complété plus tard."
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await update((s) => {
            const value: Entry = {
              ...entry,
              id: entry?.id ?? crypto.randomUUID(),
              timestamp: entry?.timestamp ?? timestamp(day),
              type: entry?.type ?? "extra",
              foodName: name.trim() || "Extra",
              note: note.trim(),
              calories: cal === "" ? null : num(cal),
              imagePath: photo,
            };
            s.entries = s.entries.filter((x) => x.id !== value.id);
            s.entries.push(value);
          });
          notify(entry ? "Entrée modifiée" : "Extra ajouté");
          close();
        }}
      >
        <Field
          label="Nom"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Courte note (facultatif)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <NumberField
          label="Calories estimées (facultatif)"
          value={cal}
          onChange={setCal}
        />
        <PhotoInput value={photo} onChange={setPhoto} />
        <Button primary type="submit">
          {entry ? "Enregistrer" : "Ajouter"}
        </Button>
      </form>
    </Sheet>
  );
}
export function FoodHub() {
  const { state, day, update, close, notify, modal } = useApp();
  const [page, setPage] = useState("home"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("Toutes"),
    [food, setFood] = useState<Food | null>(null),
    [quantity, setQuantity] = useState("100"),
    [meal, setMeal] = useState<Meal | null>(null),
    [name, setName] = useState(""),
    [parts, setParts] = useState<Ingredient[]>([]),
    [picking, setPicking] = useState(false),
    [index, setIndex] = useState<number | null>(null),
    [variable, setVariable] = useState(false),
    [overrides, setOverrides] = useState<Record<string, number>>({});
  const back = () => setPage("home");
  async function logMeal(value: Meal, amounts: Record<string, number> = {}) {
    await update((s) => {
      s.entries.push(mealEntry(value, s.foods, day, amounts));
      const m = s.meals.find((x) => x.id === value.id);
      if (m) {
        m.usageCount++;
        m.lastUsedAt = timestamp(day);
      }
      value.ingredients.forEach((p) => {
        const food = s.foods.find((x) => x.id === p.foodId);
        if (food) {
          food.usageCount++;
          food.lastUsedAt = timestamp(day);
        }
      });
    });
    notify(`${value.name} ajouté`);
    close();
  }
  function startComposer(value: Meal | null) {
    setMeal(value);
    setName(value?.name ?? "");
    setParts(structuredClone(value?.ingredients ?? []));
    setPage("composer");
  }
  const selectFood = (v: Food) => {
    setFood(v);
    setQuantity("100");
    setIndex(null);
    setVariable(false);
    setPage(picking ? "ingredient" : "quantity");
  };
  async function saveMeal(log: boolean) {
    if (!name.trim() || !parts.length) {
      notify(
        !name.trim()
          ? "Donne un nom au repas"
          : "Ajoute au moins un ingrédient",
      );
      return;
    }
    const totals = mealTotals(parts, state.foods),
      value: Meal = {
        id: meal?.id ?? crypto.randomUUID(),
        name: name.trim(),
        ingredients: parts,
        cachedCalories: totals[0],
        cachedProtein: totals[1],
        cachedCarbs: totals[2],
        cachedFat: totals[3],
        isFavorite: meal?.isFavorite ?? false,
        usageCount: meal?.usageCount ?? 0,
        lastUsedAt: meal?.lastUsedAt,
        createdAt: meal?.createdAt ?? Date.now(),
        notes: meal?.notes,
        imagePath: meal?.imagePath,
      };
    await update((s) => {
      s.meals = s.meals.filter((m) => m.id !== value.id);
      s.meals.push(value);
    });
    if (log) await logMeal(value);
    else {
      notify("Repas enregistré");
      close();
    }
  }
  if (page === "home")
    return (
      <Sheet
        title="Ajouter"
        subtitle="Choisis le chemin le plus rapide pour ce que tu manges."
      >
        {[
          ["Repas enregistrés", "Favoris, fréquents et récents", "meals"],
          ["Aliment", "Recherche instantanée et quantité libre", "foods"],
          [
            "Composer un repas",
            "Plusieurs aliments, puis réutilisable",
            "composer",
          ],
          [
            "Extra / Photo",
            "Restaurant, imprévu ou estimation ultérieure",
            "extra",
          ],
        ].map(([title, sub, p]) => (
          <Button
            className="hub-action"
            key={p}
            onClick={() => {
              setPicking(false);
              if (p === "composer") startComposer(null);
              else setPage(p);
            }}
          >
            <strong>{title}</strong>
            <small>{sub}</small>
          </Button>
        ))}
      </Sheet>
    );
  if (page === "extra") return <ExtraEditor />;
  if (page === "meals") {
    const sorted = [...state.meals].sort(
      (a, b) =>
        Number(b.isFavorite) - Number(a.isFavorite) ||
        b.usageCount - a.usageCount ||
        (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) ||
        a.name.localeCompare(b.name),
    );
    let last = "";
    return (
      <Sheet
        title="Repas enregistrés"
        subtitle="Un appui ajoute directement les repas sans quantité variable."
        back={back}
      >
        {!sorted.length && (
          <p className="card padded">
            Aucun repas enregistré. Utilise “Composer un repas” pour créer le
            premier.
          </p>
        )}
        {sorted.map((m) => {
          const group = m.isFavorite
              ? "FAVORIS"
              : m.usageCount > 0
                ? "LES PLUS UTILISÉS"
                : m.lastUsedAt
                  ? "RÉCENTS"
                  : "TOUS LES REPAS",
            show = group !== last;
          last = group;
          return (
            <div key={m.id}>
              {show && <h3 className="group-title">{group}</h3>}
              <ActionRow
                onClick={() => {
                  if (m.ingredients.some((p) => p.isVariable)) {
                    setMeal(m);
                    setOverrides({});
                    setPage("variable");
                  } else void logMeal(m);
                }}
                onFavorite={() =>
                  void update((s) => {
                    const v = s.meals.find((x) => x.id === m.id)!;
                    v.isFavorite = !v.isFavorite;
                  })
                }
                favorite={m.isFavorite}
                onEdit={() => startComposer(m)}
                onDelete={() =>
                  modal(
                    <Confirm
                      title="Supprimer ce repas ?"
                      action={() =>
                        update((s) => {
                          s.meals = s.meals.filter((x) => x.id !== m.id);
                        })
                      }
                    >
                      {m.name}
                    </Confirm>,
                  )
                }
              >
                {m.name} · {fmt(m.cachedCalories)} kcal
              </ActionRow>
            </div>
          );
        })}
      </Sheet>
    );
  }
  if (page === "variable" && meal)
    return (
      <Sheet
        title={meal.name}
        subtitle="Modifie uniquement les ingrédients variables."
        back={() => setPage("meals")}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void logMeal(meal, overrides);
          }}
        >
          {meal.ingredients
            .filter((p) => p.isVariable)
            .map((p) => (
              <NumberField
                key={p.id}
                label={`${state.foods.find((f) => f.id === p.foodId)?.name} (${state.foods.find((f) => f.id === p.foodId)?.referenceUnit})`}
                min={0.0001}
                required
                value={overrides[p.id] ?? p.quantity}
                onChange={(v) => setOverrides({ ...overrides, [p.id]: num(v) })}
              />
            ))}
          <Button primary type="submit">
            Ajouter à la journée
          </Button>
        </form>
      </Sheet>
    );
  if (page === "foods") {
    const q = normalize(query);
    const foods = state.foods
      .filter(
        (f) =>
          (category === "Toutes" || f.category === category) &&
          normalize(f.name).includes(q),
      )
      .sort(
        (a, b) =>
          Number(b.isFavorite) - Number(a.isFavorite) ||
          (q ? 0 : b.usageCount - a.usageCount) ||
          (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 40);
    return (
      <Sheet
        title="Rechercher un aliment"
        subtitle="Tape un nom. Les favoris et habitudes remontent en premier."
        back={() => setPage(picking ? "composer" : "home")}
      >
        <Field
          label="Rechercher"
          placeholder="Ex. jambon, pâtes, mozzarella…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="field">
          Catégorie
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <Button
          onClick={() => {
            setFood(null);
            setPage("food-form");
          }}
        >
          ＋ Créer un aliment personnalisé
        </Button>
        {!foods.length && <p>Aucun résultat</p>}
        {foods.map((v) => (
          <ActionRow
            key={v.id}
            onClick={() => selectFood(v)}
            onFavorite={() =>
              void update((s) => {
                const x = s.foods.find((f) => f.id === v.id)!;
                x.isFavorite = !x.isFavorite;
              })
            }
            favorite={v.isFavorite}
            onEdit={
              v.isCustom
                ? () => {
                    setFood(v);
                    setPage("food-form");
                  }
                : undefined
            }
          >
            <span>{v.name}</span>
            <small>
              {fmt(v.kcalPer100)} kcal / 100 {v.referenceUnit}
            </small>
          </ActionRow>
        ))}
      </Sheet>
    );
  }
  if (page === "food-form")
    return <FoodForm food={food} done={() => setPage("foods")} />;
  if ((page === "quantity" || page === "ingredient") && food)
    return (
      <Sheet
        title={food.name}
        subtitle={`Quantité libre en ${food.referenceUnit}`}
        back={() => setPage(page === "ingredient" ? "composer" : "foods")}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const amount = num(quantity);
            if (!(amount > 0)) return;
            if (page === "ingredient") {
              const part = {
                id: index === null ? crypto.randomUUID() : parts[index].id,
                foodId: food.id,
                quantity: amount,
                isVariable: variable,
              };
              setParts(
                index === null
                  ? [...parts, part]
                  : parts.map((p, i) => (i === index ? part : p)),
              );
              setPage("composer");
            } else {
              const v = nutrients(food, amount);
              await update((s) => {
                s.entries.push({
                  id: crypto.randomUUID(),
                  timestamp: timestamp(day),
                  type: "food",
                  foodName: food.name,
                  note: food.category,
                  quantityGrams: amount,
                  quantityUnit: food.referenceUnit,
                  calories: v[0],
                  proteinGrams: v[1],
                  carbsGrams: v[2],
                  fatGrams: v[3],
                });
                const used = s.foods.find((f) => f.id === food.id)!;
                used.usageCount++;
                used.lastUsedAt = timestamp(day);
              });
              notify(`${food.name} ajouté`);
              close();
            }
          }}
        >
          <NumberField
            label={`Quantité (${food.referenceUnit})`}
            value={quantity}
            onChange={setQuantity}
            min={0.0001}
            required
          />
          <p className="card padded">{macro(nutrients(food, num(quantity)))}</p>
          {page === "ingredient" && (
            <label className="check">
              <input
                type="checkbox"
                checked={variable}
                onChange={(e) => setVariable(e.target.checked)}
              />
              Quantité variable lors de chaque ajout
            </label>
          )}
          <Button primary type="submit">
            {index !== null ? "Modifier" : "Ajouter"}
          </Button>
        </form>
      </Sheet>
    );
  if (page === "composer")
    return (
      <Sheet
        title={meal ? "Modifier le repas" : "Composer un repas"}
        subtitle="Touche un ingrédient pour le modifier, ou reste appuyé pour le retirer."
        back={() => setPage(meal ? "meals" : "home")}
      >
        <Field
          label="Nom du repas"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {!parts.length && <p>Aucun ingrédient pour l’instant.</p>}
        {parts.map((p, i) => {
          const food = state.foods.find((f) => f.id === p.foodId)!;
          return (
            <ActionRow
              key={p.id}
              onClick={() => {
                setFood(food);
                setIndex(i);
                setQuantity(String(p.quantity));
                setVariable(p.isVariable);
                setPage("ingredient");
              }}
              onDelete={() => setParts(parts.filter((x) => x.id !== p.id))}
            >
              {food.name} · {fmt(p.quantity)} {food.referenceUnit}
              {p.isVariable ? " · VARIABLE" : ""}
            </ActionRow>
          );
        })}
        <Button
          onClick={() => {
            setPicking(true);
            setQuery("");
            setCategory("Toutes");
            setPage("foods");
          }}
        >
          ＋ Ajouter un ingrédient
        </Button>
        <p className="card padded">
          Total : {macro(mealTotals(parts, state.foods))}
        </p>
        {meal ? (
          <Button primary onClick={() => void saveMeal(false)}>
            Enregistrer les modifications
          </Button>
        ) : (
          <>
            <Button primary onClick={() => void saveMeal(true)}>
              Enregistrer comme repas et ajouter
            </Button>
            <Button onClick={() => void saveMeal(false)}>
              Enregistrer sans ajouter
            </Button>
          </>
        )}
      </Sheet>
    );
  return null;
}
function FoodForm({ food, done }: { food: Food | null; done: () => void }) {
  const { update } = useApp();
  const [name, setName] = useState(food?.name ?? ""),
    [category, setCategory] = useState(food?.category ?? "Féculents"),
    [unit, setUnit] = useState(food?.referenceUnit ?? "g"),
    [values, setValues] = useState(
      [
        food?.kcalPer100 ?? 0,
        food?.proteinPer100 ?? 0,
        food?.carbsPer100 ?? 0,
        food?.fatPer100 ?? 0,
      ].map(String),
    );
  return (
    <Sheet
      title={food ? "Modifier l’aliment" : "Nouvel aliment"}
      subtitle="Valeurs nutritionnelles pour 100 g ou 100 ml."
      back={done}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const v: Food = {
            id: food?.id ?? crypto.randomUUID(),
            name: name.trim(),
            category,
            referenceUnit: unit,
            kcalPer100: num(values[0]),
            proteinPer100: num(values[1]),
            carbsPer100: num(values[2]),
            fatPer100: num(values[3]),
            isCustom: true,
            isFavorite: food?.isFavorite ?? false,
            usageCount: food?.usageCount ?? 0,
            lastUsedAt: food?.lastUsedAt,
          };
          await update((s) => {
            s.foods = s.foods.filter((f) => f.id !== v.id);
            s.foods.push(v);
          });
          done();
        }}
      >
        <Field
          label="Nom"
          value={name}
          required
          onChange={(e) => setName(e.target.value)}
        />
        <label className="field">
          Catégorie
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.slice(1).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {["kcal", "g protéines", "g glucides", "g lipides"].map((l, i) => (
          <NumberField
            key={l}
            label={l}
            value={values[i]}
            required
            onChange={(v) => setValues(values.map((x, j) => (i === j ? v : x)))}
          />
        ))}
        <label className="field">
          Unité
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option>g</option>
            <option>ml</option>
          </select>
        </label>
        <Button primary type="submit">
          Enregistrer l’aliment
        </Button>
      </form>
    </Sheet>
  );
}
