import {
  useCallback,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { repository, supabase } from "./persistence";
import {
  dayKey,
  titleDay,
  labelDay,
  allDays,
  basal,
  profileBasal,
  type State,
} from "./domain";
import { Context } from "./ui";
import { Global } from "./Global";
import { Meals } from "./Meals";
import Kermit from "./Kermit";
import { Measurements } from "./Measurements";
import { Activity } from "./Activity";
import { Duo } from "./Duo";
import { Account, DataScreen } from "./Settings";
import { Profile } from "./Profile";
import { Appearance, applyAppearance, defaultHaloColor } from "./Appearance";
import { updateApplicationIcons } from "./app-icons";
import { enableHorizontalWheel } from "./horizontal-scroll";
const tabs = [
  ["global", "Accueil", "ic_home"],
  ["meals", "Repas", "ic_meat"],
  ["body", "Corps", "ic_other"],
  ["duo", "Duo", "ic_heart"],
];
export default function App() {
  useEffect(() => enableHorizontalWheel(document.getElementById("root")!), []);
  const [, render] = useState(0),
    [ready, setReady] = useState(false),
    [fatal, setFatal] = useState(""),
    [screen, setScreen] = useState("global"),
    [bodySection, setBodySection] = useState("activity"),
    [partnerAccent, setPartnerAccent] = useState<string | null>(null),
    [demoAccent, setDemoAccent] = useState<string | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    [today, setToday] = useState(dayKey()),
    [sheet, setSheet] = useState<ReactNode>(null),
    [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const accountSheet = isValidElement(sheet) && sheet.type === Account;
  const kermitSheet = isValidElement(sheet) && sheet.type === Kermit;
  const sheetOpener = useRef<HTMLElement | null>(null);
  const [desktopBody, setDesktopBody] = useState(
    () => window.matchMedia("(min-width: 1200px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1200px)");
    const change = () => setDesktopBody(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const handlePartnerAccent = useCallback(
    (accent: string | null, first: string | null = null) => {
      setPartnerAccent(accent);
      setDemoAccent(first);
    },
    [],
  );
  const state = repository.state,
    day = editing ?? today;
  const weightSignature = JSON.stringify(
    Object.entries(state.days).map(([d, v]) => [d, v.weightKg]),
  );
  const notify = (s: string) => setMessage(s);
  const requestSheetClose = () => {
    if (
      window.dispatchEvent(
        new Event("kermit:beforeclose", { cancelable: true }),
      )
    )
      setSheet(null);
  };
  useEffect(() => repository.subscribe(() => render((v) => v + 1)), []);
  useEffect(() => {
    const apply = () => {
      applyAppearance(state.settings);
      if (editing)
        document
          .querySelector('meta[name="theme-color"]')
          ?.setAttribute("content", "#f1dfc4");
      updateApplicationIcons(
        ready && repository.scope !== "guest"
          ? state.settings.haloColor
          : defaultHaloColor,
      );
    };
    apply();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [
    state.settings.theme,
    state.settings.haloColor,
    ready,
    repository.scope,
    editing,
  ]);
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null =
      null;
    let scope = "";
    const switchScope = async (id: string) => {
      if (scope === id) return;
      scope = id;
      setReady(false);
      updateApplicationIcons();
      setSheet(null);
      setEditing(null);
      setScreen("global");
      setPartnerAccent(null);
      setDemoAccent(null);
      setMessage("");
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
      (d) => !state.days[d] || (!state.days[d].basal && basal(state, d) > 0),
    );
    const automatic = Boolean(state.settings.birthDate);
    const current = automatic
      ? profileBasal(state, today)
      : state.settings.basal;
    const refresh =
      automatic &&
      (state.days[today]?.basal !== current ||
        state.settings.basal !== current);
    if (missing.length || refresh)
      void repository
        .update((s) => {
          for (const d of missing)
            s.days[d] = {
              ...s.days[d],
              basal: basal(s, d),
              target: s.days[d]?.target ?? s.settings.target,
            };
          if (automatic) {
            s.settings.basal = current;
            s.days[today] = { ...s.days[today], basal: current };
          }
        })
        .catch((e) => notify(String(e)));
  }, [
    ready,
    today,
    state.settings.first,
    state.settings.basal,
    state.settings.birthDate,
    state.settings.sex,
    state.settings.height,
    weightSignature,
  ]);
  useEffect(() => {
    const element = dialog.current;
    if (sheet) {
      if (!element?.open)
        sheetOpener.current = document.activeElement as HTMLElement | null;
      if (element?.open) element.close();
      // Password-manager panels are injected outside this dialog. Native modal
      // inertness would prevent clicking them, regardless of their z-index.
      if (accountSheet) element?.show();
      else element?.showModal();
      document.body.style.overflow = "hidden";
    } else {
      element?.close();
      document.body.style.overflow = "";
      sheetOpener.current?.focus();
      sheetOpener.current = null;
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [!!sheet, accountSheet]);
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
        <h1>Kalo</h1>
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
    screen === "body" && !desktopBody && bodySection === "measurements"
      ? "Mensurations"
      : screen === "body"
        ? "Corps"
        : screen === "duo"
          ? "Duo"
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
        close: requestSheetClose,
        notify,
        update,
      }}
    >
      <div
        className={`app ${editing ? "editing" : ""}`}
        inert={!!sheet && accountSheet}
      >
        <div
          className="ambient-halo"
          aria-hidden="true"
          style={
            screen === "duo" && partnerAccent
              ? {
                  background: `linear-gradient(90deg, ${demoAccent || "var(--halo-color)"} 0%, ${demoAccent || "var(--halo-color)"} 50%, ${partnerAccent} 50%, ${partnerAccent} 100%)`,
                }
              : undefined
          }
        />
        <aside className="logger-sidebar" aria-label="Kalo">
          <div className="logger-brand">
            Kalo<span>.</span>
          </div>
          <p className="sidebar-label">MON ESPACE</p>
          <div className="sidebar-footer">
            <strong>À ton rythme.</strong>
            <p>
              Un peu plus de repères.
              <br />
              Un peu moins de charge mentale.
            </p>
            <button className="text-button" onClick={() => setScreen("data")}>
              Données et sauvegardes
            </button>
            <button
              className="text-button"
              onClick={() => setSheet(<Appearance />)}
            >
              Apparence
            </button>
          </div>
        </aside>
        <div className="logger-topbar">
          <div className="logger-brand mobile-brand">
            Kalo<span>.</span>
          </div>
          <p className="logger-breadcrumb">
            Mon espace <span>/</span>{" "}
            {screen === "data"
              ? "Données"
              : tabs.find((t) => t[0] === screen)?.[1]}
          </p>
          <button
            className="account-access"
            onClick={() => setSheet(<Account />)}
          >
            <span className="account-avatar" aria-hidden="true">
              {state.settings.displayName
                ?.slice(0, 2)
                .toLocaleUpperCase("fr") || "K"}
            </span>
            <span>
              {repository.scope === "guest"
                ? "Mode local · Se connecter"
                : `${state.settings.displayName || "Mon compte"} · Compte`}
            </span>
          </button>
        </div>
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
                className="text-button header-back"
                onClick={() => setScreen("global")}
              >
                ‹ Retour
              </button>
            )}
            <p className="logger-eyebrow">MON JOURNAL · MON ÉQUILIBRE</p>
            <h1>{title}</h1>
            {screen !== "data" && (
              <p className="subtitle">
                {screen === "body" &&
                !desktopBody &&
                bodySection === "measurements"
                  ? "Fais glisser pour parcourir les groupes"
                  : titleDay(day)}
              </p>
            )}
          </header>
          {screen === "global" &&
            repository.scope !== "guest" &&
            !state.settings.profileCompleted && (
              <Profile key={repository.scope} inline />
            )}
          {screen === "global" && <Global onExport={() => setScreen("data")} />}
          {screen === "meals" && <Meals />}
          {screen === "body" && (
            <>
              <div
                className="halo-presets body-tabs"
                aria-label="Sections de Corps"
              >
                <button
                  aria-pressed={bodySection === "activity"}
                  onClick={() => setBodySection("activity")}
                >
                  Activité
                </button>
                <button
                  aria-pressed={bodySection === "measurements"}
                  onClick={() => setBodySection("measurements")}
                >
                  Mensurations
                </button>
              </div>
              <div className="body-layout">
                {(desktopBody || bodySection === "activity") && (
                  <section
                    className="body-panel body-activity"
                    aria-label="Activité"
                  >
                    {desktopBody && (
                      <h2 className="body-panel-title">Activité</h2>
                    )}
                    <Activity key={day} />
                  </section>
                )}
                {(desktopBody || bodySection === "measurements") && (
                  <section
                    className="body-panel body-measurements"
                    aria-label="Mensurations"
                  >
                    {desktopBody && (
                      <h2 className="body-panel-title">Mensurations</h2>
                    )}
                    <Measurements key={day} />
                  </section>
                )}
              </div>
            </>
          )}
          {screen === "duo" && (
            <Duo key={repository.scope} onPartnerAccent={handlePartnerAccent} />
          )}
          {screen === "data" && <DataScreen />}
        </main>
        <nav className="liquid-nav" aria-label="Navigation principale">
          {tabs.map(([id, label, icon]) => (
            <button
              key={id}
              className={`tab ${screen === id ? "active" : ""}`}
              aria-label={label}
              aria-current={screen === id ? "page" : undefined}
              onClick={() => {
                setScreen(id);
                if (id === "body") setBodySection("activity");
                window.scrollTo(0, 0);
              }}
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
      {sheet && accountSheet && (
        <div
          className="account-sheet-backdrop"
          onClick={() => setSheet(null)}
          aria-hidden="true"
        />
      )}
      <dialog
        ref={dialog}
        className={`sheet${accountSheet ? " account-sheet" : ""}${kermitSheet ? " kermit-dialog" : ""}`}
        aria-label={kermitSheet ? "Kermit Cuisto" : undefined}
        onKeyDown={(e) => {
          if (accountSheet && e.key === "Escape") {
            e.preventDefault();
            setSheet(null);
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          requestSheetClose();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) {
            const r = dialog.current.getBoundingClientRect();
            if (
              e.clientY < r.top ||
              e.clientY > r.bottom ||
              e.clientX < r.left ||
              e.clientX > r.right
            )
              requestSheetClose();
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
