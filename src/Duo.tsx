import { useEffect, useRef, useState } from "react";
import { useApp, Button, Field, Sheet, Confirm } from "./ui";
import { docsToState } from "./persistence";
import { categories, privateSharing, type Category } from "./duo-model";
import { DuoComparison, type DuoProfile } from "./DuoComparison";
import { duoRequest, type DuoSnapshot } from "./duo-client";
import demo from "./duo-demo.json";
import { validateState } from "./transfer";
import { RefreshCw, SlidersHorizontal } from "lucide-react";

type DuoProps = {
  settings?: boolean;
  onPartnerAccent?: (accent: string | null, first?: string | null) => void;
};

export function Duo(props: DuoProps) {
  const { state } = useApp();
  return state.settings.duoDemo === true ? (
    <DemoDuo {...props} />
  ) : (
    <LiveDuo {...props} />
  );
}

function DemoDuo({ settings = false, onPartnerAccent }: DuoProps) {
  const profiles = demo.profiles.map((profile) => validateState(profile));
  const firstAccent = profiles[0].settings.haloColor!;
  const secondAccent = profiles[1].settings.haloColor!;
  useEffect(() => {
    onPartnerAccent?.(secondAccent, firstAccent);
    return () => onPartnerAccent?.(null);
  }, [firstAccent, secondAccent, onPartnerAccent]);
  const permissions = {
    weight: true,
    measurements: true,
    activity: true,
    goals: true,
    food: true,
  };
  const content = (
    <>
      <section className="card padded">
        <h2>Exemple de Duo</h2>
        <p>Données entièrement fictives · Lecture seule.</p>
      </section>
      {!settings && (
        <DuoComparison
          initialDay={demo.through}
          profiles={
            profiles.map((profile) => ({
              name: profile.settings.displayName!,
              accent: profile.settings.haloColor,
              state: profile,
              permissions,
            })) as [DuoProfile, DuoProfile]
          }
        />
      )}
    </>
  );
  return settings ? (
    <Sheet title="Duo de démonstration">{content}</Sheet>
  ) : (
    content
  );
}

function LiveDuo({ settings = false, onPartnerAccent }: DuoProps) {
  const { repo, state, modal } = useApp();
  const [snapshot, setSnapshot] = useState<DuoSnapshot | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [code, setCode] = useState(""),
    [updated, setUpdated] = useState("");
  const generation = useRef(0);
  const scope = repo.scope;
  useEffect(() => {
    const accent =
      snapshot?.status === "active" ? snapshot.partner?.accent : null;
    onPartnerAccent?.(accent && /^#[\da-f]{6}$/i.test(accent) ? accent : null);
    return () => onPartnerAccent?.(null);
  }, [snapshot?.status, snapshot?.partner?.accent, onPartnerAccent]);
  const run = async (action = "snapshot", payload: unknown = {}) => {
    const request = ++generation.current;
    setSnapshot(null);
    setBusy(true);
    setError("");
    try {
      const result = await duoRequest(action, payload);
      if (request === generation.current && repo.scope === scope) {
        setSnapshot(result);
        setUpdated(new Date().toLocaleTimeString("fr-FR"));
        if (action !== "snapshot")
          window.dispatchEvent(new Event("duo-changed"));
      }
    } catch (e) {
      if (request === generation.current) setError((e as Error).message);
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  useEffect(() => {
    if (scope === "guest") return;
    void run();
    const refresh = () => void run();
    const clear = () => {
      ++generation.current;
      setSnapshot(null);
      setBusy(false);
      setError("Connexion perdue. Les données du partenaire ont été retirées.");
    };
    const visibility = () => {
      if (document.hidden) clear();
      else refresh();
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", clear);
    window.addEventListener("duo-changed", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      ++generation.current;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", clear);
      window.removeEventListener("duo-changed", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [scope]);
  const permissions = { ...privateSharing(), ...snapshot?.sharing };
  const partnerState = snapshot?.documents
    ? docsToState(
        snapshot.documents.map((d) => ({ ...d, revision: 0, pending: false })),
      )
    : null;
  if (
    partnerState &&
    !snapshot?.documents?.some((d) => d.key === "settings/target")
  )
    partnerState.settings.target = 0;
  if (
    partnerState &&
    !snapshot?.documents?.some((d) => d.key === "settings/deficitGoal")
  )
    partnerState.settings.deficitGoal = 0;
  const content = (
    <>
      {scope === "guest" ? (
        <p>
          Connecte-toi à ton compte pour associer ton partenaire. Ton journal
          local reste disponible.
        </p>
      ) : (
        <>
          {error && <p role="alert">{error}</p>}
          <div className="duo-control-bar">
            <small
              role="status"
              title="Actualisation automatique toutes les 30 secondes"
            >
              {busy
                ? "Actualisation…"
                : updated && !error
                  ? `À jour · ${updated.slice(0, 5)}`
                  : ""}
            </small>
            {snapshot?.status === "active" && !settings && (
              <button
                type="button"
                className="duo-sharing-control"
                aria-label="Gérer mon partage Duo"
                onClick={() => modal(<Duo settings />)}
              >
                <SlidersHorizontal size={16} aria-hidden="true" /> Partage
              </button>
            )}
            <button
              type="button"
              className={`duo-refresh-control${busy ? " is-loading" : ""}`}
              disabled={busy}
              aria-label="Actualiser Duo"
              title="Actualiser Duo"
              onClick={() => void run()}
            >
              <RefreshCw size={18} aria-hidden="true" />
            </button>
          </div>
          {snapshot?.status === "none" && (
            <section className="card padded">
              {snapshot.mode === "fixed" ? (
                <>
                  <h2>Votre Duo privé</h2>
                  <p>
                    Vos deux comptes sont déjà associés. Chacun doit activer le
                    Duo avant de partager ses données.
                  </p>
                  <Button
                    primary
                    disabled={busy}
                    onClick={() => void run("join")}
                  >
                    Activer mon Duo
                  </Button>
                </>
              ) : (
                <>
                  <h2>Aucun partenaire associé</h2>
                  <p>
                    Crée un code privé valable 24 heures et transmets-le à ton
                    partenaire. Son acceptation vous associera. Aucune catégorie
                    n’est partagée au départ.
                  </p>
                  <Button disabled={busy} onClick={() => void run("invite")}>
                    Créer une invitation
                  </Button>
                  <Field
                    label="Code reçu de mon partenaire"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <Button
                    disabled={busy || !code.trim()}
                    onClick={() => void run("accept", { code: code.trim() })}
                  >
                    Accepter cette liaison
                  </Button>
                </>
              )}
            </section>
          )}
          {snapshot?.status === "pending" && (
            <section className="card padded">
              <h2>Liaison en attente</h2>
              {snapshot.mode === "fixed" ? (
                <p>
                  Ton accord est enregistré. Ton partenaire doit aussi activer
                  son Duo pour terminer la liaison.
                </p>
              ) : (
                <>
                  <p>
                    Code privé : <code>{snapshot.code}</code>
                  </p>
                  <p>
                    Aucune donnée partagée avant acceptation. Le code expire
                    après 24 heures.
                  </p>
                </>
              )}
            </section>
          )}
          {snapshot?.status === "unavailable" && (
            <p>Cet espace privé est réservé aux deux comptes associés.</p>
          )}
          {snapshot?.status === "unconfigured" && (
            <p role="alert">L’espace Duo n’est pas encore activé.</p>
          )}
          {snapshot?.status === "active" && (
            <>
              {settings ? (
                <section className="card padded">
                  <h2>Mes autorisations de partage</h2>
                  <p>
                    Chaque catégorie est indépendante. Les changements sont
                    enregistrés sur le serveur.
                  </p>
                  {(Object.keys(categories) as Category[]).map((key) => (
                    <label className="field" key={key}>
                      <span>
                        <input
                          type="checkbox"
                          checked={permissions[key]}
                          disabled={busy}
                          onChange={(e) =>
                            void run("share", {
                              ...permissions,
                              [key]: e.target.checked,
                            })
                          }
                        />{" "}
                        {categories[key]}
                      </span>
                    </label>
                  ))}
                </section>
              ) : (
                <>
                  {partnerState && (
                    <DuoComparison
                      profiles={[
                        {
                          name: state.settings.displayName || "Moi",
                          accent: state.settings.haloColor,
                          state,
                          permissions: {
                            weight: true,
                            measurements: true,
                            activity: true,
                            goals: true,
                            food: true,
                          },
                        },
                        {
                          name: snapshot.partner?.name || "Mon partenaire",
                          accent: snapshot.partner?.accent,
                          state: partnerState,
                          permissions: {
                            ...privateSharing(),
                            ...snapshot.partnerSharing,
                          },
                        },
                      ]}
                    />
                  )}
                </>
              )}
            </>
          )}
          {snapshot &&
            (snapshot.status === "pending" || snapshot.status === "active") && (
              <Button
                disabled={busy}
                onClick={() =>
                  modal(
                    <Confirm
                      title="Révoquer la liaison Duo ?"
                      action={async () => {
                        await duoRequest("revoke");
                        window.dispatchEvent(new Event("duo-changed"));
                        modal(<Duo settings />);
                      }}
                    >
                      L’accès partagé sera retiré côté serveur et les
                      autorisations seront supprimées pour les deux comptes.
                    </Confirm>,
                  )
                }
              >
                Révoquer la liaison
              </Button>
            )}
        </>
      )}
    </>
  );
  return settings ? <Sheet title="Partage Duo">{content}</Sheet> : content;
}
