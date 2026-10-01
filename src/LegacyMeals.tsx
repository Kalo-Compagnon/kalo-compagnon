import { useRef, useState } from "react";
import catalog from "./legacy_catalog.json";
import {
  useApp,
  Sheet,
  Button,
  NumberField,
  Field,
  PhotoInput,
  num,
} from "./ui";
import { div, mul, f, fmt, timestamp, labelDay, type Entry } from "./domain";
import { ExtraEditor } from "./FoodHub";
type Dish = (typeof catalog.dishes)[number];
type Part = {
  key: string;
  name: string;
  quantity: number;
  rate: number;
  unit: string;
  perUnit: boolean;
};
export const legacyCalories = (
  parts: Part[],
  rates: Record<string, number> = {},
) =>
  Math.trunc(
    parts.reduce(
      (sum, p) =>
        sum + div(mul(p.quantity, rates[p.key] ?? p.rate), p.perUnit ? 1 : 100),
      0,
    ),
  );
export function LegacyMenu() {
  const { modal } = useApp();
  return (
    <Sheet
      title="Repas · outils historiques"
      subtitle="Fonctions présentes dans le projet Android mais absentes de ses quatre onglets actuels."
    >
      <Button onClick={() => modal(<LegacyCatalog />)}>
        Catalogue prédéfini
      </Button>
      <Button onClick={() => modal(<LegacyWizard />)}>
        Assistant de repas
      </Button>
      <Button onClick={() => modal(<SimpleMeal />)}>
        Créer un repas simple avec photo
      </Button>
    </Sheet>
  );
}
export function LegacyCatalog() {
  const { state, day, update, close, modal } = useApp();
  const [family, setFamily] = useState(""),
    [dish, setDish] = useState<Dish | null>(null),
    [parts, setParts] = useState<Part[]>([]);
  function choose(d: Dish) {
    if (d.isExtra) {
      modal(<ExtraEditor defaultName={d.name} />);
      return;
    }
    setDish(d);
    setParts(
      d.ingredients.map((i) => ({
        key: i.key,
        name: i.name,
        quantity:
          state.settings.legacyQuantities?.[`${d.id}_${i.key}`] ??
          i.defaultQuantity,
        rate: state.settings.legacyRates?.[i.key] ?? i.caloriesPer100,
        unit: i.unit,
        perUnit: i.perUnit,
      })),
    );
  }
  if (dish)
    return (
      <Sheet title={dish.name} back={() => setDish(null)}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await update((s) => {
              for (const p of parts) {
                s.settings.legacyRates = {
                  ...s.settings.legacyRates,
                  [p.key]: p.rate,
                };
                s.settings.legacyQuantities = {
                  ...s.settings.legacyQuantities,
                  [`${dish.id}_${p.key}`]: p.quantity,
                };
              }
              s.entries.push({
                id: crypto.randomUUID(),
                timestamp: timestamp(day),
                type: "meal",
                foodName: dish.name,
                calories: legacyCalories(parts),
                note: parts
                  .map((p) => `${p.name} ${fmt(p.quantity)} ${p.unit}`)
                  .join(" · "),
              });
            });
            close();
          }}
        >
          {parts.map((p, i) => (
            <div className="card padded" key={p.key}>
              <strong>{p.name}</strong>
              <NumberField
                label={p.unit}
                value={p.quantity}
                required
                onChange={(v) =>
                  setParts(
                    parts.map((x, j) =>
                      i === j ? { ...x, quantity: num(v) } : x,
                    ),
                  )
                }
              />
              <NumberField
                label={p.perUnit ? "kcal/pièce" : "kcal/100"}
                min={0.0001}
                required
                value={p.rate}
                onChange={(v) =>
                  setParts(
                    parts.map((x, j) => (i === j ? { ...x, rate: num(v) } : x)),
                  )
                }
              />
              <p>
                {Math.trunc(div(mul(p.quantity, p.rate), p.perUnit ? 1 : 100))}{" "}
                kcal
              </p>
            </div>
          ))}
          <p className="net pink">{legacyCalories(parts)} kcal</p>
          <Button primary type="submit">
            Ajouter
          </Button>
        </form>
      </Sheet>
    );
  return (
    <Sheet
      title="Catalogue prédéfini"
      back={family ? () => setFamily("") : undefined}
    >
      {family
        ? catalog.dishes
            .filter((d) => d.family === family)
            .map((d) => (
              <Button key={d.id} onClick={() => choose(d)}>
                {d.name}
              </Button>
            ))
        : catalog.families.map((f) => (
            <Button key={f.id} onClick={() => setFamily(f.id)}>
              {f.name}
            </Button>
          ))}
    </Sheet>
  );
}
function SimpleMeal() {
  const { update, close } = useApp();
  const [name, setName] = useState(""),
    [calories, setCalories] = useState(""),
    [note, setNote] = useState(""),
    [photo, setPhoto] = useState("");
  return (
    <Sheet title="Créer un repas">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await update((s) => {
            s.meals.push({
              id: crypto.randomUUID(),
              name: name.trim(),
              ingredients: [],
              cachedCalories: num(calories),
              cachedProtein: 0,
              cachedCarbs: 0,
              cachedFat: 0,
              isFavorite: false,
              usageCount: 0,
              createdAt: Date.now(),
              notes: note,
              imagePath: photo,
            });
          });
          close();
        }}
      >
        <Field
          label="Nom du repas"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <NumberField
          label="Calories estimées"
          required
          min={1}
          step={1}
          value={calories}
          onChange={setCalories}
        />
        <Field
          label="Ingrédients"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <PhotoInput value={photo} onChange={setPhoto} />
        <Button primary type="submit">
          Enregistrer
        </Button>
      </form>
    </Sheet>
  );
}
type Choice = [string, () => void];
type Page = {
  question: string;
  choices?: Choice[];
  quantity?: { unit: string; initial: number; next: (v: number) => void };
  summary?: Entry;
};
export function LegacyWizard() {
  const { state, day, update, close, modal } = useApp(),
    parts = useRef<Part[]>([]),
    name = useRef("Repas"),
    type = useRef("meal");
  const [page, setPage] = useState<Page | null>(null),
    [amount, setAmount] = useState(""),
    [step, setStep] = useState(1);
  const add = (
    key: string,
    title: string,
    quantity: number,
    rate: number,
    unit = "g",
    perUnit = false,
  ) => {
    parts.current.push({
      key,
      name: title,
      quantity: f(quantity),
      rate,
      unit,
      perUnit,
    });
  };
  function choices(question: string, values: Choice[]) {
    setPage({ question, choices: values });
  }
  function quantity(
    question: string,
    unit: string,
    initial: number,
    next: (v: number) => void,
  ) {
    setAmount(String(initial));
    setPage({ question, quantity: { unit, initial, next } });
  }
  function finish(extra?: string) {
    const details = parts.current
        .map((p) => `${p.name} ${fmt(p.quantity)} ${p.unit}`)
        .join(" · "),
      title =
        extra ??
        `${name.current} · ${parts.current
          .slice(1, 3)
          .map((p) => p.name)
          .join(" + ")}`.replace(/[ ·]+$/, "");
    setPage({
      question: "C’est bon pour toi ?",
      summary: {
        id: crypto.randomUUID(),
        timestamp: timestamp(day),
        type: extra ? "extra" : type.current,
        foodName: title,
        note: extra ? "Calories à estimer" : details,
        calories: extra
          ? null
          : legacyCalories(parts.current, state.settings.legacyRates),
      },
    });
  }
  function start() {
    parts.current = [];
    name.current = "Repas";
    type.current = "meal";
    setPage(null);
    setStep(1);
  }
  function sandwich() {
    name.current = "Sandwich";
    choices("Quelle taille de baguette ?", [
      [
        "Baguette entière",
        () => {
          add("bread", "Baguette entière", 250, 248);
          sandwichMeat();
        },
      ],
      [
        "Demi-baguette",
        () => {
          add("bread", "Demi-baguette", 125, 248);
          sandwichMeat();
        },
      ],
    ]);
  }
  function sandwichMeat() {
    choices("Quelle viande ?", [
      [
        "Jambon",
        () => {
          add("ham", "Jambon", 60, 120);
          sandwichCheese();
        },
      ],
      [
        "Poulet",
        () => {
          add("chicken", "Poulet", 80, 165);
          sandwichCheese();
        },
      ],
      [
        "Rosette",
        () => {
          add("rosette", "Rosette", 50, 410);
          sandwichCheese();
        },
      ],
    ]);
  }
  function sandwichCheese() {
    choices("Avec quel fromage ?", [
      ["Sans fromage", sandwichApple],
      [
        "Emmental",
        () => {
          add("emmental", "Emmental", 30, 380);
          sandwichApple();
        },
      ],
      [
        "Mozzarella",
        () => {
          add("mozzarella", "Mozzarella", 60, 250);
          sandwichApple();
        },
      ],
    ]);
  }
  function sandwichApple() {
    choices("Ajouter une pomme ?", [
      ["Non", () => finish()],
      [
        "Oui",
        () => {
          add("apple", "Pomme", 150, 52);
          finish();
        },
      ],
    ]);
  }
  function pasta() {
    name.current = "Pâtes";
    quantity("Poids des pâtes crues ?", "g", 80, (g) => {
      add("pasta", "Pâtes sèches", g, 350);
      choices("Avec ou sans sauce ?", [
        ["Sans sauce", pastaMeat],
        [
          "Sauce tomate",
          () => {
            add("tomato_sauce", "Sauce tomate", 100, 40);
            pastaMeat();
          },
        ],
        [
          "Crème 15 %",
          () => {
            add("cream15", "Crème 15 %", 50, 170);
            pastaMeat();
          },
        ],
        [
          "Carbonara",
          () => {
            add("cream15", "Crème 15 %", 50, 170);
            add("bacon", "Lardons", 80, 300);
            pastaCheese();
          },
        ],
      ]);
    });
  }
  function pastaMeat() {
    choices("Ajouter une viande ?", [
      ["Sans viande", pastaCheese],
      [
        "Poulet",
        () => {
          add("chicken", "Poulet", 100, 165);
          pastaCheese();
        },
      ],
      [
        "Chorizo",
        () => {
          add("chorizo", "Chorizo", 50, 455);
          pastaCheese();
        },
      ],
      [
        "Merguez",
        () => {
          add("merguez", "Merguez", 100, 300);
          pastaCheese();
        },
      ],
    ]);
  }
  function pastaCheese() {
    choices("Ajouter du fromage ?", [
      ["Sans fromage", () => finish()],
      [
        "Parmesan",
        () => {
          add("parmesan", "Parmesan", 20, 431);
          finish();
        },
      ],
      [
        "Mozzarella",
        () => {
          add("mozzarella", "Mozzarella", 100, 250);
          finish();
        },
      ],
    ]);
  }
  function crepes() {
    name.current = "Crêpes";
    quantity("Combien de crêpes ?", "pièce(s)", 3, (c) => {
      add("crepe", "Crêpe nature", c, 154, "pièce", true);
      choices("Quelle garniture ?", [
        [
          "Jambon + emmental",
          () => {
            add("ham", "Jambon", mul(c, 40), 120);
            add("emmental", "Emmental", mul(c, 20), 380);
            finish();
          },
        ],
        [
          "Rosette + emmental",
          () => {
            add("rosette", "Rosette", mul(c, 35), 410);
            add("emmental", "Emmental", mul(c, 20), 380);
            finish();
          },
        ],
        [
          "Poulet + fromage",
          () => {
            add("chicken", "Poulet", mul(c, 45), 165);
            add("cheese", "Fromage", mul(c, 20), 350);
            finish();
          },
        ],
        [
          "Mozzarella",
          () => {
            add("mozzarella", "Mozzarella", mul(c, 45), 250);
            finish();
          },
        ],
        [
          "Nutella",
          () => {
            add("nutella", "Nutella", mul(c, 30), 539);
            finish();
          },
        ],
        [
          "2 salées + 1 Nutella",
          () => {
            add("ham", "Jambon", 80, 120);
            add("emmental", "Emmental", 40, 380);
            add("nutella", "Nutella", 30, 539);
            finish();
          },
        ],
      ]);
    });
  }
  function tomato() {
    name.current = "Tomate–mozzarella";
    quantity("Quantité de tomate ?", "g", 200, (t) => {
      add("tomato", "Tomate", t, 18);
      quantity("Quantité de mozzarella ?", "g", 100, (m) => {
        add("mozzarella", "Mozzarella", m, 250);
        choices("Ajouter du pain ?", [
          ["Sans pain", tomatoMeat],
          [
            "Avec pain",
            () =>
              quantity("Quantité de pain ?", "g", 80, (b) => {
                add("bread", "Pain", b, 248);
                tomatoMeat();
              }),
          ],
        ]);
      });
    });
  }
  function tomatoMeat() {
    choices("Ajouter de la charcuterie ?", [
      ["Sans charcuterie", () => finish()],
      [
        "Jambon",
        () => {
          add("ham", "Jambon", 60, 120);
          finish();
        },
      ],
      [
        "Rosette",
        () => {
          add("rosette", "Rosette", 50, 410);
          finish();
        },
      ],
      [
        "Saucisson",
        () => {
          add("sausage", "Saucisson", 60, 478);
          finish();
        },
      ],
    ]);
  }
  function charcuterie() {
    name.current = "Repas charcuterie";
    choices("Quelle charcuterie ?", [
      ["Saucisson", () => charQuantity("sausage", "Saucisson", 478)],
      ["Rosette", () => charQuantity("rosette", "Rosette", 410)],
      ["Jambon", () => charQuantity("ham", "Jambon", 120)],
    ]);
  }
  function charQuantity(k: string, n: string, r: number) {
    quantity(`Quantité de ${n} ?`, "g", 60, (q) => {
      add(k, n, q, r);
      choices("Ajouter du pain ?", [
        ["Sans pain", charCheese],
        [
          "Avec pain",
          () => {
            add("bread", "Pain", 100, 248);
            charCheese();
          },
        ],
      ]);
    });
  }
  function charCheese() {
    choices("Ajouter du fromage ?", [
      ["Sans fromage", () => finish()],
      [
        "Avec fromage",
        () => {
          add("cheese", "Fromage", 40, 350);
          finish();
        },
      ],
    ]);
  }
  function potatoes() {
    name.current = "Pommes de terre";
    quantity("Quantité de pommes de terre ?", "g", 300, (q) => {
      add("potato", "Pommes de terre", q, 80);
      choices("Ajouter une viande ?", [
        ["Sans viande", potatoCream],
        [
          "Poulet",
          () => {
            add("chicken", "Poulet", 100, 165);
            potatoCream();
          },
        ],
        [
          "Merguez",
          () => {
            add("merguez", "Merguez", 100, 300);
            potatoCream();
          },
        ],
      ]);
    });
  }
  function potatoCream() {
    choices("Ajouter de la crème ?", [
      ["Sans crème", charCheese],
      [
        "Avec crème 15 %",
        () => {
          add("cream15", "Crème 15 %", 50, 170);
          charCheese();
        },
      ],
    ]);
  }
  function quick() {
    name.current = "Repas ultra-rapide";
    choices("Quel repas rapide ?", [
      [
        "Jambon + fromage + pain",
        () => {
          add("ham", "Jambon", 60, 120);
          add("cheese", "Fromage", 40, 350);
          add("bread", "Pain", 100, 248);
          finish();
        },
      ],
      [
        "Tomate-mozza",
        () => {
          add("tomato", "Tomate", 200, 18);
          add("mozzarella", "Mozzarella", 100, 250);
          finish();
        },
      ],
      [
        "Sandwich préparé",
        () => {
          add("bread", "Pain", 140, 248);
          add("ham", "Jambon", 60, 120);
          add("emmental", "Emmental", 30, 380);
          finish();
        },
      ],
      ["Fruit + produit laitier", fruitDairy],
      [
        "Mozzarella + pain + jambon",
        () => {
          add("mozzarella", "Mozzarella", 100, 250);
          add("bread", "Pain", 100, 248);
          add("ham", "Jambon", 60, 120);
          finish();
        },
      ],
      [
        "Charcuterie + fromage + fruit",
        () => {
          add("rosette", "Rosette", 50, 410);
          add("cheese", "Fromage", 40, 350);
          add("fruit", "Fruit", 150, 55);
          finish();
        },
      ],
    ]);
  }
  function fruitDairy() {
    add("fruit", "Fruit", 150, 55);
    add("dairy", "Produit laitier", 125, 65);
    finish();
  }
  function shake() {
    add("banana", "Banane", 120, 89);
    add("milk", "Lait", 250, 46, "ml");
  }
  function snacks() {
    name.current = "Collation";
    type.current = "snack";
    choices("Quelle collation ?", [
      [
        "Banane",
        () => {
          add("banana", "Banane", 120, 89);
          finish();
        },
      ],
      [
        "Pomme",
        () => {
          add("apple", "Pomme", 150, 52);
          finish();
        },
      ],
      [
        "Milkshake banane + lait",
        () => {
          shake();
          finish();
        },
      ],
      [
        "Milkshake + cacao",
        () => {
          shake();
          add("cocoa", "Cacao", 10, 380);
          finish();
        },
      ],
      [
        "Milkshake + vanille",
        () => {
          shake();
          add("vanilla", "Vanille", 8, 288);
          finish();
        },
      ],
      ["Fruit + produit laitier", fruitDairy],
    ]);
  }
  function extras() {
    choices(
      "Quel type d’extra ?",
      catalog.dishes
        .filter((d) => d.isExtra)
        .map((d) => [
          d.name,
          () => {
            if (d.id === "extra_photo") modal(<ExtraEditor />);
            else finish(d.name);
          },
        ]),
    );
  }
  const current = page ?? {
    question: "Que manges-tu ?",
    choices: [
      ["Sandwich", sandwich],
      ["Pâtes", pasta],
      ["Crêpes", crepes],
      ["Tomate–mozzarella", tomato],
      ["Charcuterie / repas plaisir", charcuterie],
      ["Pommes de terre", potatoes],
      ["Repas ultra-rapide", quick],
      ["Collation", snacks],
      ["Extra / repas non planifié", extras],
    ] as Choice[],
  };
  return (
    <Sheet
      title={current.question}
      subtitle={current.summary ? "RÉCAPITULATIF" : `ÉTAPE ${step}`}
      back={page ? start : undefined}
    >
      {parts.current.length > 0 && !current.summary && (
        <p className="note">{parts.current.map((p) => p.name).join(" · ")}</p>
      )}
      {current.choices?.map(([label, action]) => (
        <Button
          key={label}
          onClick={() => {
            setStep(step + 1);
            action();
          }}
        >
          {label}
        </Button>
      ))}
      {current.quantity && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setStep(step + 1);
            current.quantity!.next(num(amount));
          }}
        >
          <NumberField
            label={current.quantity.unit}
            required
            min={0.0001}
            value={amount}
            onChange={setAmount}
          />
          <Button primary type="submit">
            Continuer
          </Button>
        </form>
      )}
      {current.summary && (
        <>
          <h3>{current.summary.foodName}</h3>
          <p>{current.summary.note}</p>
          <p className="net pink">
            {current.summary.calories === null
              ? "À estimer plus tard"
              : `${current.summary.calories} kcal`}
          </p>
          <Button
            primary
            onClick={async () => {
              await update((s) => s.entries.push(current.summary!));
              close();
            }}
          >
            Ajouter au {labelDay(day)}
          </Button>
        </>
      )}
    </Sheet>
  );
}
