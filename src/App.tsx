import { useEffect, useRef, useState, type ReactNode } from "react";
import { repository, supabase } from "./persistence";
import { dayKey, titleDay, labelDay, allDays, type State } from "./domain";
import { Context } from "./ui";
import { Global } from "./Global";
import { Meals } from "./Meals";
import { Measurements } from "./Measurements";
import { Activity } from "./Activity";
import { DataScreen } from "./Settings";
const tabs = [
  ["global", "Global", "ic_home", "#2F6BFF"],
  ["meals", "Repas", "ic_meat", "#FF2D70"],
  ["measurements", "Mensuration", "cm", "#FFD54F"],
  ["activity", "Activité", "ic_other", "#41D17D"],
];
export default function App() {
  const [, render] = useState(0),
    [ready, setReady] = useState(false),
    [fatal, setFatal] = useState(""),
    [screen, setScreen] = useState("global"),
    [editing, setEditing] = useState<string | null>(null),
    [today, setToday] = useState(dayKey()),
    [sheet, setSheet] = useState<ReactNode>(null),
    [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const state = repository.state,
    day = editing ?? today;
  const notify = (s: string) => setMessage(s);
  useEffect(() => repository.subscribe(() => render((v) => v + 1)), []);
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null =
      null;
    let scope = "";
    const switchScope = async (id: string) => {
      if (scope === id) return;
      scope = id;
      setReady(false);
      setSheet(null);
      setEditing(null);
      if (channel && supabase) void supabase.removeChannel(channel);
      try {
        await repository.load(id);
        if (id !== "guest") await repository.sync();
        if (!cancelled) setReady(true);
      } catch (e) {
        setFatal(`Impossible de charger les données : ${(e as Error).message}`);
      }
    };
    if (supabase) {
      supabase.auth
        .getSession()
        .then(({ data }) => void switchScope(data.session?.user.id ?? "guest"));
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => void switchScope(session?.user.id ?? "guest"), 0);
      });
      return () => {
        cancelled = true;
        subscription.unsubscribe();
      };
    }
    void switchScope("guest");
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      setToday(dayKey());
      void repository.sync();
    }, 15000);
    const refresh = () => {
      setToday(dayKey());
      void repository.sync();
    };
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const missing = allDays(state).filter(
      (d) =>
        !state.days[d] || (!state.days[d].basal && state.settings.basal > 0),
    );
    if (missing.length)
      void repository
        .update((s) => {
          for (const d of missing)
            s.days[d] = {
              ...s.days[d],
              basal: s.days[d]?.basal || s.settings.basal,
              target: s.days[d]?.target ?? s.settings.target,
            };
        })
        .catch((e) => notify(String(e)));
  }, [ready, today, state.settings.first, state.settings.basal]);
  useEffect(() => {
    if (sheet) {
      dialog.current?.showModal();
      document.body.style.overflow = "hidden";
    } else {
      dialog.current?.close();
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [!!sheet]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 7000);
    return () => clearTimeout(t);
  }, [message]);
  const update = async (fn: (s: State) => void) => {
    try {
      await repository.update(fn);
      void repository.sync();
    } catch (e) {
      notify(`Enregistrement impossible : ${(e as Error).message}`);
      throw e;
    }
  };
  if (fatal)
    return (
      <main className="screen">
        <h1>Logger</h1>
        <p role="alert">{fatal}</p>
        <p>
          Aucune donnée n’a été effacée. Réessaie après avoir autorisé le
          stockage du navigateur.
        </p>
      </main>
    );
  if (!ready)
    return (
      <main className="screen">
        <p>Chargement du journal…</p>
      </main>
    );
  const title =
    screen === "measurements"
      ? "Mensurations"
      : screen === "activity"
        ? "Activité physique"
        : screen === "data"
          ? "Données"
          : editing
            ? "Journée en modification"
            : "Aujourd’hui";
  return (
    <Context.Provider
      value={{
        state,
        repo: repository,
        day,
        editDay: setEditing,
        modal: setSheet,
        close: () => setSheet(null),
        notify,
        update,
      }}
    >
      <div
        className={`app ${editing ? "editing" : ""}`}
        style={
          {
            "--accent": tabs.find((t) => t[0] === screen)?.[3] ?? "#2F6BFF",
          } as React.CSSProperties
        }
      >
        {editing && (
          <div className="edit-banner">
            <span>
              Modification
              <br />
              {labelDay(editing)}
            </span>
            <button onClick={() => setEditing(null)}>Terminer ✓</button>
          </div>
        )}
        <main className={`screen ${screen}`}>
          <header>
            {screen === "data" && (
              <button
                className="text-button"
                onClick={() => setScreen("global")}
              >
                ‹ Retour
              </button>
            )}
            <h1>{title}</h1>
            {screen !== "data" && (
              <p className="subtitle">
                {screen === "measurements"
                  ? "Fais glisser pour parcourir les groupes"
                  : titleDay(day)}
              </p>
            )}
          </header>
          {screen === "global" && <Global onExport={() => setScreen("data")} />}
          {screen === "meals" && <Meals />}
          {screen === "measurements" && <Measurements key={day} />}
          {screen === "activity" && <Activity key={day} />}
          {screen === "data" && <DataScreen />}
        </main>
        <nav className="liquid-nav" aria-label="Navigation principale">
          {tabs.map(([id, label, icon, color]) => (
            <button
              key={id}
              className={`tab ${screen === id ? "active" : ""}`}
              aria-label={label}
              aria-current={screen === id ? "page" : undefined}
              onClick={() => {
                setScreen(id);
                window.scrollTo(0, 0);
              }}
              style={{ color: screen === id ? color : undefined }}
            >
              {icon === "cm" ? (
                <b className="cm-icon">cm</b>
              ) : (
                <span
                  className="tab-icon"
                  style={{
                    maskImage: `url(${import.meta.env.BASE_URL}assets/${icon}.svg)`,
                    WebkitMaskImage: `url(${import.meta.env.BASE_URL}assets/${icon}.svg)`,
                  }}
                />
              )}
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      <dialog
        ref={dialog}
        className="sheet"
        onCancel={() => setSheet(null)}
        onClick={(e) => {
          if (e.target === dialog.current) {
            const r = dialog.current.getBoundingClientRect();
            if (
              e.clientY < r.top ||
              e.clientY > r.bottom ||
              e.clientX < r.left ||
              e.clientX > r.right
            )
              setSheet(null);
          }
        }}
      >
        {sheet}
      </dialog>
      {message && (
        <div className="toast" role="status" onClick={() => setMessage("")}>
          {message}
        </div>
      )}
    </Context.Provider>
  );
}
