import ciqual from "./ciqual-data.json";
import { useRef, useState } from "react";
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
  } | null>(null);
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
              gesture.current =
                f.isCustom && e.button === 0
                  ? { x: e.clientX, y: e.clientY, id: f.id, swiped: false }
                  : null;
            }}
            onPointerMove={(e) => {
              const start = gesture.current;
              if (!start || start.id !== f.id) return;
              if (Math.abs(e.clientY - start.y) > 24) {
                gesture.current = null;
                return;
              }
              if (start.x - e.clientX > 60) start.swiped = true;
            }}
            onPointerUp={(e) => {
              const start = gesture.current;
              if (!start || start.id !== f.id) return;
              if (
                start.swiped &&
                start.x - e.clientX > 60 &&
                Math.abs(e.clientY - start.y) < 24
              ) {
                e.preventDefault();
                edit(f as Food);
              } else gesture.current = null;
            }}
            onPointerCancel={() => {
              gesture.current = null;
            }}
            onClickCapture={(e) => {
              if (gesture.current?.swiped) {
                e.preventDefault();
                e.stopPropagation();
              }
              gesture.current = null;
            }}
            onKeyDown={(e) => {
              if (f.isCustom && e.key === "ArrowLeft") {
                e.preventDefault();
                edit(f as Food);
              }
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
