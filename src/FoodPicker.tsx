import { useEffect, useRef, useState } from "react";
import { PlusCircle, Star, Pencil, Search } from "lucide-react";
import { Button, Field, useApp } from "./ui";
import { fmt, referenceAmount, type Food } from "./domain";
import {
  internalFood,
  searchFoods,
  sourceLabel,
  selectableFood,
  type CatalogFood,
  type SourceFilter,
  type FoodSection,
} from "./food-search";
import { cachedProducts, searchOFF } from "./off";
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
  const [filter, setFilter] = useState<Exclude<SourceFilter, "generic">>("all"),
    [section, setSection] = useState<FoodSection>("recent");
  const [external, setExternal] = useState<CatalogFood[]>([]);
  const [status, setStatus] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    void cachedProducts().then((v) => {
      if (active) setExternal(v);
    });
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    controller.current?.abort();
    setStatus("");
  }, [query]);
  const foods = searchFoods(
    [...state.foods.filter(selectableFood), ...external],
    query,
    filter,
    section,
  );
  async function remote() {
    if (query.trim().length < 2) return;
    if (filter === "personal") setFilter("all");
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setStatus("Recherche Open Food Facts…");
    try {
      const found = await searchOFF(query, request.signal);
      if (request.signal.aborted) return;
      setExternal((old) =>
        [
          ...found,
          ...old.filter((f) => !found.some((x) => x.id === f.id)),
        ].slice(0, 800),
      );
      setStatus(found.length ? "" : "Aucun produit Open Food Facts trouvé.");
    } catch {
      if (!request.signal.aborted)
        setStatus(
          "Open Food Facts temporairement indisponible. Les aliments locaux restent disponibles.",
        );
    }
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
    <div className="food-picker">
      <form
        className="food-search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void remote();
        }}
      >
        <Field
          label="Rechercher"
          placeholder="Rechercher un aliment, une marque…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="food-search-submit"
          type="submit"
          aria-label="Lancer la recherche Open Food Facts"
          title="Rechercher dans Open Food Facts (nom, marque ou code-barres)"
          disabled={query.trim().length < 2}
        >
          <Search size={18} />
        </button>
      </form>
      {query.trim().length >= 2 && (
        <Button
          className="food-off-search"
          onClick={() => void remote()}
          disabled={status === "Recherche Open Food Facts…"}
        >
          Rechercher dans Open Food Facts
        </Button>
      )}
      <div
        className="food-options food-filters"
        role="group"
        aria-label="Type d’aliment"
      >
        {(
          [
            ["all", "Tous"],
            ["products", "Produits"],
            ["personal", "Catalogue Kalo"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            primary={filter === key}
            aria-pressed={filter === key}
            onClick={() => {
              controller.current?.abort();
              setStatus("");
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
      {status && <p role="status">{status}</p>}
      {!foods.length && (
        <p role="status">
          {query.trim()
            ? "Aucun aliment local trouvé. Essaie une autre recherche ou consulte Open Food Facts."
            : section === "recent"
              ? "Aucun aliment récent. Recherche un aliment ou ouvre le catalogue."
              : section === "favorites"
                ? "Aucun favori. Utilise l’étoile d’un aliment pour le retrouver ici."
                : filter === "personal"
                  ? "Aucun aliment personnalisé. Crée ton premier aliment dans le Catalogue Kalo."
                  : "Recherche un produit par nom, marque ou code-barres, puis utilise la loupe pour consulter Open Food Facts."}
        </p>
      )}
      <div className="food-results">
        {foods.map((f) => (
          <div className="food-result" key={f.id}>
            <button className="row-main" onClick={() => void keep(f)}>
              <span>
                {f.name}
                {f.brand ? ` · ${f.brand}` : ""}
              </span>
              <small>
                {sourceLabel(f)} ·{" "}
                {f.kcalPer100 === null
                  ? "Calories manquantes"
                  : f.referenceUnit === "unité"
                    ? `${fmt(f.kcalPer100)} kcal/unité`
                    : `${fmt(f.kcalPer100)} kcal/${referenceAmount(f)} ${f.referenceUnit}`}
              </small>
            </button>
            <button
              className="food-icon"
              aria-label={`${f.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"} : ${f.name}`}
              aria-pressed={f.isFavorite}
              onClick={() => void keep(f, true)}
            >
              <Star size={18} fill={f.isFavorite ? "currentColor" : "none"} />
            </button>
            <button
              className="food-icon"
              aria-label={`Ajouter ${f.name}`}
              onClick={() => void keep(f)}
            >
              <PlusCircle size={20} />
            </button>
            {f.isCustom && (
              <button
                className="food-icon"
                aria-label={`Modifier ${f.name}`}
                onClick={() => edit(f as Food)}
              >
                <Pencil size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
      {foods.length === 40 && (
        <p>
          40 résultats affichés. Précise ta recherche pour affiner la liste.
        </p>
      )}
      <Button className="food-create" onClick={create}>
        ＋ Créer un aliment personnalisé
      </Button>
      <small className="food-attribution">
        Source des produits :{" "}
        {state.foods.some((f) => f.source === "ciqual") && (
          <>
            <a href="https://ciqual.anses.fr/" target="_blank" rel="noreferrer">
              ANSES, Ciqual
            </a>{" "}
            ·{" "}
          </>
        )}
        <a
          href="https://world.openfoodfacts.org/terms-of-use"
          target="_blank"
          rel="noreferrer"
        >
          Open Food Facts — ODbL
        </a>
      </small>
    </div>
  );
}
