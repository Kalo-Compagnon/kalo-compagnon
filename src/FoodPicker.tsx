import ciqual from "./ciqual-data.json";
import { useEffect, useRef, useState } from "react";
import { PlusCircle, Star } from "lucide-react";
import { Button, Confirm, Field, useApp } from "./ui";
import {
  fmt,
  foodLabel,
  nutrients,
  referenceAmount,
  normalize,
  mealTotals,
  remainingMealPortions,
  type Food,
  type Meal,
} from "./domain";
import MealCalculator, { type DraftMealPart } from "./MealCalculator";
import MealPortions from "./MealPortions";
import { SwipeActions } from "./SwipeActions";
import {
  internalFood,
  searchFoods,
  sourceLabel,
  selectableFood,
  type CatalogFood,
  type SourceFilter,
  type FoodSection,
} from "./food-search";

export default function FoodPicker({
  query,
  setQuery,
  select,
  create,
  createMeal,
  onViewChange,
  ingredientsOnly = false,
  edit,
}: {
  query: string;
  setQuery: (q: string) => void;
  select: (f: Food) => void;
  create: () => void;
  createMeal: () => void;
  onViewChange?: (view: "foods" | "meals") => void;
  ingredientsOnly?: boolean;
  edit: (f: Food) => void;
}) {
  const { state, update, notify, modal } = useApp();
  const [parts, setParts] = useState<DraftMealPart[]>([]);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [loadedMeal, setLoadedMeal] = useState<Meal | null>(null);
  const [filter, setFilter] = useState<SourceFilter | "meals">("kalo"),
    [section, setSection] = useState<FoodSection>("recent");
  const gesture = useRef<{
    x: number;
    y: number;
    id: string;
    swiped: boolean;
    pointerId: number;
  } | null>(null);
  const [slide, setSlide] = useState<{
    id: string;
    x: number;
    dragging: boolean;
  } | null>(null);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  useEffect(
    () => () => {
      if (editTimer.current) clearTimeout(editTimer.current);
    },
    [],
  );
  function animateEdit(food: Food, remove = false) {
    if (editTimer.current) return;
    setSlide({ id: food.id, x: remove ? 104 : -104, dragging: false });
    editTimer.current = setTimeout(
      () => {
        editTimer.current = null;
        gesture.current = null;
        setSlide(null);
        if (remove)
          modal(
            <Confirm
              title="Supprimer cet aliment ?"
              action={async () => {
                await update((s) => {
                  const saved = s.foods.find((f) => f.id === food.id);
                  if (saved) saved.isDeleted = true;
                });
                setParts((old) =>
                  old.filter((part) => part.food.id !== food.id),
                );
                notify("Aliment supprimé du catalogue");
              }}
            >
              <p>
                {foodLabel(food)} sera retiré du catalogue Kalo commun pour tous
                les utilisateurs. Les anciens repas et le journal seront
                conservés.
              </p>
            </Confirm>,
          );
        else edit(food);
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180,
    );
  }
  const foods =
    filter === "meals"
      ? []
      : searchFoods(
          [...state.foods.filter(selectableFood), ...(ciqual as CatalogFood[])],
          query,
          filter,
          section,
        );
  const meals = state.meals
    .filter((meal) => {
      if (ingredientsOnly) return false;
      if (filter !== "meals" && filter !== "all") return false;
      if (query.trim())
        return normalize(query)
          .split(/\s+/)
          .every((token) => normalize(meal.name).includes(token));
      return section === "favorites"
        ? meal.isFavorite
        : section === "recent"
          ? !!meal.lastUsedAt
          : true;
    })
    .sort((a, b) =>
      section === "recent"
        ? (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)
        : a.name.localeCompare(b.name, "fr"),
    );
  function loadMeal(meal: Meal, scroll = false) {
    const draft = meal.ingredients.map((part) => ({
      id: crypto.randomUUID(),
      food: state.foods.find((f) => f.id === part.foodId),
      quantity: String(part.quantity),
      weightBasis: part.weightBasis,
    }));
    if (!draft.length || draft.some((part) => !part.food)) {
      notify(
        "Ce repas ne peut pas être chargé : des ingrédients sont manquants.",
      );
      return;
    }
    const load = () => {
      setParts(draft as DraftMealPart[]);
      setLoadedMeal(meal);
      if (scroll)
        requestAnimationFrame(() =>
          pickerRef.current?.querySelector(".meal-calculator")?.scrollIntoView({
            block: "nearest",
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "instant"
              : "smooth",
          }),
        );
    };
    if (parts.length)
      modal(
        <Confirm
          title="Remplacer le repas en préparation ?"
          action={async () => load()}
        >
          Le repas en cours sera remplacé par {meal.name}.
        </Confirm>,
      );
    else load();
  }
  async function keep(value: CatalogFood, favorite = false) {
    try {
      const f = internalFood(value);
      await update((s) => {
        const saved = s.foods.find((x) => x.id === f.id);
        if (saved) {
          if (favorite) saved.isFavorite = !saved.isFavorite;
        } else s.foods.push({ ...f, isFavorite: favorite });
      });
      if (!favorite) select(state.foods.find((x) => x.id === f.id) ?? f);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <div className="food-picker" ref={pickerRef}>
      <div className="food-search-bar">
        <Field
          label="Rechercher"
          placeholder={
            filter === "meals"
              ? "Rechercher un repas..."
              : "Rechercher un aliment, une marque..."
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="food-create"
          type="button"
          onClick={filter === "meals" ? createMeal : create}
          aria-label={
            filter === "meals"
              ? "Créer un repas"
              : "＋ Créer un aliment personnalisé"
          }
          title={filter === "meals" ? "Créer un repas" : "Créer un aliment"}
        >
          <PlusCircle size={18} aria-hidden="true" />
          <span>Créer</span>
        </button>
      </div>
      <div
        className="food-options food-filters"
        role="group"
        aria-label="Type d’aliment"
      >
        {(
          [
            ["all", "Tous"],
            ["meals", "Repas"],
            ["kalo", "Catalogue Kalo"],
          ] as const
        )
          .filter(([key]) => !ingredientsOnly || key !== "meals")
          .map(([key, label]) => (
            <Button
              key={key}
              primary={filter === key}
              aria-pressed={filter === key}
              aria-label={
                key === "meals" ? "Afficher les repas enregistrés" : undefined
              }
              onClick={() => {
                if (key !== filter && (key === "meals" || filter === "meals"))
                  setQuery("");
                setFilter(key);
                onViewChange?.(key === "meals" ? "meals" : "foods");
                if (key === "meals") setSection("catalog");
              }}
            >
              {label}
            </Button>
          ))}
      </div>
      <div
        className="food-options food-sections"
        role="group"
        aria-label={
          filter === "meals" ? "Parcourir les repas" : "Parcourir les aliments"
        }
      >
        {(
          [
            ["recent", "Récents"],
            ["favorites", "Favoris"],
            ["catalog", "Catalogue"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            primary={section === key}
            aria-pressed={section === key}
            onClick={() => setSection(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      {!foods.length && !meals.length && (
        <p role="status">
          {filter === "meals"
            ? query.trim()
              ? "Aucun repas trouvé."
              : "Aucun repas enregistré. Compose un repas ci-dessous puis enregistre-le."
            : query.trim()
              ? "Aucun aliment trouv\u00e9. Essaie une autre recherche ou cr\u00e9e un aliment."
              : section === "recent"
                ? "Aucun aliment récent. Recherche un aliment ou ouvre le catalogue."
                : section === "favorites"
                  ? "Aucun favori. Utilise l’étoile d’un aliment pour le retrouver ici."
                  : filter === "kalo"
                    ? "Le catalogue Kalo est vide. Crée un aliment pour le compléter."
                    : "Aucun aliment brut disponible dans le référentiel Ciqual."}
        </p>
      )}
      <small className="food-gesture-hint">
        {filter === "meals"
          ? "Glisse à gauche pour modifier un repas, à droite pour le supprimer."
          : "Glisse vers la gauche pour modifier, vers la droite pour supprimer."}
      </small>
      <div
        className="food-results"
        role="region"
        aria-label={
          filter === "meals" ? "Résultats des repas" : "Résultats des aliments"
        }
        tabIndex={0}
      >
        {meals.map((meal) => (
          <SwipeActions
            key={`meal-${meal.id}`}
            className="meal-swipe"
            onEdit={() => loadMeal(meal, true)}
            onDelete={() =>
              modal(
                <Confirm
                  title="Supprimer ce repas ?"
                  action={async () => {
                    await update((s) => {
                      s.meals = s.meals.filter((m) => m.id !== meal.id);
                    });
                    if (loadedMeal?.id === meal.id) {
                      setParts([]);
                      setLoadedMeal(null);
                    }
                    notify("Repas supprimé");
                  }}
                >
                  <p>
                    {meal.name} sera retiré de tes repas enregistrés. Les repas
                    déjà ajoutés au journal seront conservés.
                  </p>
                </Confirm>,
              )
            }
          >
            <div className="food-result meal-result">
              <div className="food-result-content">
                <button
                  className="row-main"
                  onClick={() => loadMeal(meal)}
                  aria-label={`Préparer ${meal.name}`}
                >
                  <span>
                    {meal.name} ·{" "}
                    {fmt(remainingMealPortions(meal, state.entries))} portion(s)
                    restante(s)
                    {meal.cookedWeightGrams != null &&
                      ` · ${fmt((meal.cookedWeightGrams * remainingMealPortions(meal, state.entries)) / (meal.portions ?? 1))} g restants`}
                  </span>
                  <small>
                    Repas ·{" "}
                    {fmt(
                      meal.ingredients.every((p) =>
                        state.foods.some((f) => f.id === p.foodId),
                      ) && meal.ingredients.length
                        ? mealTotals(meal.ingredients, state.foods)[0]
                        : meal.cachedCalories,
                    )}{" "}
                    kcal
                  </small>
                </button>
                <button
                  className="food-icon"
                  aria-label={`${meal.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"} : ${meal.name}`}
                  aria-pressed={meal.isFavorite}
                  onClick={() =>
                    void update((s) => {
                      const value = s.meals.find((m) => m.id === meal.id);
                      if (value) value.isFavorite = !value.isFavorite;
                    })
                  }
                >
                  <Star
                    size={18}
                    fill={meal.isFavorite ? "currentColor" : "none"}
                  />
                </button>
                <button
                  className="food-icon"
                  aria-label={`Préparer le repas ${meal.name}`}
                  onClick={() => loadMeal(meal)}
                >
                  <PlusCircle size={20} />
                </button>
                <button
                  className="food-icon"
                  aria-label={`Choisir les portions de ${meal.name}`}
                  title="Portions ou poids de mon assiette"
                  onClick={() => modal(<MealPortions meal={meal} />)}
                >
                  <span aria-hidden="true">½</span>
                </button>
              </div>
            </div>
          </SwipeActions>
        ))}
        {foods.map((f) => (
          <div
            className="food-result"
            key={f.id}
            onPointerDown={(e) => {
              if (editTimer.current || !e.isPrimary) return;
              suppressClick.current = false;
              gesture.current =
                f.isCustom && e.button === 0
                  ? {
                      x: e.clientX,
                      y: e.clientY,
                      id: f.id,
                      swiped: false,
                      pointerId: e.pointerId,
                    }
                  : null;
            }}
            onPointerMove={(e) => {
              const start = gesture.current;
              if (
                !start ||
                start.id !== f.id ||
                start.pointerId !== e.pointerId ||
                editTimer.current
              )
                return;
              const dx = e.clientX - start.x,
                dy = Math.abs(e.clientY - start.y);
              if (!start.swiped && dy > 12 && dy > Math.abs(dx)) {
                suppressClick.current = true;
                gesture.current = null;
                setSlide(null);
                return;
              }
              if (Math.abs(dx) > 8 || start.swiped) {
                if (!start.swiped)
                  e.currentTarget.setPointerCapture(e.pointerId);
                start.swiped = true;
                setSlide({
                  id: f.id,
                  x: Math.max(-120, Math.min(120, dx)),
                  dragging: true,
                });
              }
            }}
            onPointerUp={(e) => {
              const start = gesture.current;
              if (
                !start ||
                start.id !== f.id ||
                start.pointerId !== e.pointerId
              )
                return;
              if (start.swiped && Math.abs(start.x - e.clientX) > 60) {
                e.preventDefault();
                animateEdit(f as Food, e.clientX > start.x);
              } else {
                setSlide(null);
                if (!start.swiped) gesture.current = null;
              }
            }}
            onPointerCancel={() => {
              suppressClick.current = true;
              gesture.current = null;
              setSlide(null);
            }}
            onClickCapture={(e) => {
              if (
                e.detail !== 0 &&
                (gesture.current?.swiped || suppressClick.current)
              ) {
                e.preventDefault();
                e.stopPropagation();
              }
              gesture.current = null;
              suppressClick.current = false;
            }}
            onKeyDown={(e) => {
              if (f.isCustom && e.key === "ArrowLeft") {
                e.preventDefault();
                animateEdit(f as Food);
              }
              if (f.isCustom && e.key === "Delete") {
                e.preventDefault();
                animateEdit(f as Food, true);
              }
            }}
          >
            {f.isCustom && (
              <span className="food-delete-reveal" aria-hidden="true">
                Supprimer
              </span>
            )}
            {f.isCustom && (
              <span className="food-edit-reveal" aria-hidden="true">
                Modifier
              </span>
            )}
            <div
              className={`food-result-content${slide?.id === f.id && slide.dragging ? " is-dragging" : ""}`}
              style={{
                transform: `translateX(${slide?.id === f.id ? slide.x : 0}px)`,
              }}
            >
              <button className="row-main" onClick={() => void keep(f)}>
                <span>
                  {foodLabel(f)}
                  {f.brand ? ` · ${f.brand}` : ""}
                </span>
                <small>
                  {sourceLabel(f)} ·{" "}
                  {f.kcalPer100 === null
                    ? "Calories manquantes"
                    : f.referenceUnit === "unité"
                      ? `${fmt(nutrients(f as Food, 1)[0])} kcal/unité${f.unitWeightGrams ? ` (${fmt(f.unitWeightGrams)} g)` : ""}`
                      : `${fmt(f.kcalPer100)} kcal/${referenceAmount(f)} ${f.referenceUnit}`}
                </small>
              </button>
              <button
                className="food-icon"
                aria-label={`${f.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"} : ${foodLabel(f)}`}
                aria-pressed={f.isFavorite}
                onClick={() => void keep(f, true)}
              >
                <Star size={18} fill={f.isFavorite ? "currentColor" : "none"} />
              </button>
              <button
                className="food-icon"
                aria-label={`Ajouter ${foodLabel(f)}`}
                onClick={() => void keep(f)}
              >
                <PlusCircle size={20} />
              </button>
              {!ingredientsOnly && (
                <button
                  className="food-icon"
                  aria-label={`Ajouter ${foodLabel(f)} au repas`}
                  title="Ajouter au calculateur de repas"
                  onClick={() => {
                    try {
                      const food = internalFood(f);
                      setParts((old) => [
                        ...old,
                        {
                          id: crypto.randomUUID(),
                          food,
                          quantity: String(referenceAmount(food)),
                        },
                      ]);
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="5" />
                    <path d="M2 3v5a2 2 0 0 0 4 0V3M4 3v18M22 21V3c-3 2-3 8 0 8" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {!ingredientsOnly && (
        <MealCalculator
          parts={parts}
          setParts={setParts}
          loadedMeal={loadedMeal}
          onReset={() => setLoadedMeal(null)}
        />
      )}
      <small className="food-attribution">
        {filter === "meals"
          ? "Catalogue de tes repas créés et enregistrés."
          : "Catalogue Kalo : aliments ajoutés par les utilisateurs."}
        {filter !== "meals" && ciqual.length > 0 && (
          <>
            {" "}
            · Aliments bruts :{" "}
            <a href="https://ciqual.anses.fr/" target="_blank" rel="noreferrer">
              ANSES, Ciqual
            </a>
          </>
        )}
      </small>
    </div>
  );
}
