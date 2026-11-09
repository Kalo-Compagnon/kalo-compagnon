import ciqual from "./ciqual-data.json";
import { useEffect, useRef, useState } from "react";
import { PlusCircle, Star } from "lucide-react";
import { Button, Field, useApp } from "./ui";
import {
  fmt,
  foodLabel,
  nutrients,
  referenceAmount,
  type Food,
} from "./domain";
import MealCalculator, { type DraftMealPart } from "./MealCalculator";
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
  edit,
}: {
  query: string;
  setQuery: (q: string) => void;
  select: (f: Food) => void;
  create: () => void;
  edit: (f: Food) => void;
}) {
  const { state, update, notify } = useApp();
  const [parts, setParts] = useState<DraftMealPart[]>([]);
  const [filter, setFilter] = useState<SourceFilter>("kalo"),
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
  function animateEdit(food: Food) {
    if (editTimer.current) return;
    setSlide({ id: food.id, x: -104, dragging: false });
    editTimer.current = setTimeout(
      () => {
        editTimer.current = null;
        gesture.current = null;
        setSlide(null);
        edit(food);
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180,
    );
  }
  const foods = searchFoods(
    [...state.foods.filter(selectableFood), ...(ciqual as CatalogFood[])],
    query,
    filter,
    section,
  );
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
    <div className="food-picker">
      <div className="food-search-bar">
        <Field
          label="Rechercher"
          placeholder="Rechercher un aliment, une marque..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="food-create"
          type="button"
          onClick={create}
          aria-label="＋ Créer un aliment personnalisé"
          title="Créer un aliment"
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
            ["generic", "Aliments bruts"],
            ["kalo", "Catalogue Kalo"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            primary={filter === key}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div
        className="food-options food-sections"
        role="group"
        aria-label="Parcourir les aliments"
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
      {!foods.length && (
        <p role="status">
          {query.trim()
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
        Glisse un aliment personnalisé vers la gauche pour le modifier.
      </small>
      <div
        className="food-results"
        role="region"
        aria-label="Résultats des aliments"
        tabIndex={0}
      >
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
              if (dx < -8 || start.swiped) {
                if (!start.swiped)
                  e.currentTarget.setPointerCapture(e.pointerId);
                start.swiped = true;
                setSlide({
                  id: f.id,
                  x: Math.max(-120, Math.min(0, dx)),
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
              if (start.swiped && start.x - e.clientX > 60) {
                e.preventDefault();
                animateEdit(f as Food);
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
            }}
          >
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
            </div>
          </div>
        ))}
      </div>
      <MealCalculator parts={parts} setParts={setParts} />
      <small className="food-attribution">
        Catalogue Kalo : aliments ajoutés par les utilisateurs.
        {ciqual.length > 0 && (
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
