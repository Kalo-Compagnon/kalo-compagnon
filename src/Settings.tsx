import { useState } from "react";
import { useApp, Button, Field, Sheet, Confirm } from "./ui";
import { supabase, accountSessions } from "./persistence";
import { AccountLoginRequired } from "./account-sessions";
import { useEffect } from "react";
import { allDays, dayKey, type State } from "./domain";
import {
  download,
  exportJSON,
  exportCSV,
  importJSON,
  importCSV,
  mergeImport,
} from "./transfer";
import { PhysicalRecords } from "./Measurements";
import { LegacyMenu } from "./LegacyMeals";
import { Profile } from "./Profile";
import { Appearance } from "./Appearance";
import { Duo } from "./Duo";
import {
  UserRound,
  Palette,
  HeartHandshake,
  RefreshCw,
  Upload,
  LogOut,
  X,
  Cloud,
  HardDrive,
  Plus,
  Check,
  ArrowLeftRight,
} from "lucide-react";
import "./account.css";
export function DataScreen() {
  const { state, modal, update, notify } = useApp();
  const [preview, setPreview] = useState<{
    state: State;
    warnings: string[];
  } | null>(null);
  return (
    <>
      <h2>Exporter les données</h2>
      <section className="card padded">
        <strong>Contenu de l’export</strong>
        <p>
          {allDays(state).length} journées
          <br />
          {state.entries.length} entrées alimentaires
          <br />
          {state.physical.length} relevés physiques
          <br />
          {state.meals.length} repas enregistrés
          <br />
          {
            state.foods.filter(
              (f) => f.isCustom || f.isFavorite || f.usageCount > 0,
            ).length
          }{" "}
          aliments personnels, favoris ou utilisés
          <br />
          {state.imports.length} imports d’activité .fit
        </p>
      </section>
      <Button
        className="export-btn"
        onClick={() =>
          download(
            `kalo_export_${dayKey()}.csv`,
            exportCSV(state),
            "text/csv;charset=utf-8",
          )
        }
      >
        Exporter toutes mes données (.csv)
      </Button>
      <Button
        className="export-btn"
        onClick={() =>
          download(
            `kalo_backup_${dayKey()}.json`,
            exportJSON(state),
            "application/json",
          )
        }
      >
        Sauvegarde complète (.json)
      </Button>
      <h2 className="section-title">Importer des données</h2>
      <p className="note">
        JSON ou CSV Kalo (anciens fichiers Logger compatibles). Vérification
        avant import ; les données existantes sont conservées, sauf les
        enregistrements de même identifiant remplacés par l’import.
      </p>
      <label className="outline file-button">
        Choisir un fichier JSON ou CSV
        <input
          type="file"
          accept=".json,.csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const text = await file.text();
              setPreview(
                file.name.toLowerCase().endsWith(".json")
                  ? { state: importJSON(text), warnings: [] }
                  : importCSV(text),
              );
            } catch (e) {
              notify((e as Error).message);
            }
          }}
        />
      </label>
      {preview && (
        <section className="card padded">
          <p>
            {preview.state.entries.length} entrées,{" "}
            {Object.keys(preview.state.days).length} journées,{" "}
            {preview.state.meals.length} repas.
          </p>
          {preview.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          <Button
            primary
            onClick={() =>
              modal(
                <Confirm
                  title="Importer ces données ?"
                  action={async () => {
                    await update((s) => mergeImport(s, preview.state));
                    setPreview(null);
                    notify("Import terminé");
                  }}
                >
                  Les valeurs communes et les réglages seront remplacés par ceux
                  du fichier. Les autres données seront conservées.
                </Confirm>,
              )
            }
          >
            Importer après vérification
          </Button>
          <Button onClick={() => setPreview(null)}>Annuler</Button>
        </section>
      )}
      <h2 className="section-title">Compte et données</h2>
      <Button className="export-btn" onClick={() => modal(<Appearance />)}>
        Apparence
      </Button>
      <Button className="export-btn" onClick={() => modal(<Profile />)}>
        Mon profil et mes objectifs
      </Button>
      <Button className="export-btn" onClick={() => modal(<LegacyMenu />)}>
        Repas · outils historiques
      </Button>
      <Button className="export-btn" onClick={() => modal(<Account />)}>
        Synchronisation iPhone / PC
      </Button>
      <Button className="export-btn" onClick={() => modal(<PhysicalRecords />)}>
        Progression physique · poids et photos
      </Button>
      <p className="note">
        Les photos jointes sur le web sont incluses dans les sauvegardes. Les
        chemins de photos Android nécessitent les fichiers d’origine.
      </p>
    </>
  );
}
export function Account() {
  const { repo, state, close, notify, modal } = useApp(),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [signup, setSignup] = useState(false),
    [addingAccount, setAddingAccount] = useState(false),
    [savedAccounts, setSavedAccounts] = useState(accountSessions.list),
    [accountEmail, setAccountEmail] = useState("");
  const connected = repo.scope !== "guest";
  useEffect(
    () =>
      accountSessions.subscribe(() => setSavedAccounts(accountSessions.list())),
    [],
  );
  useEffect(() => {
    if (connected)
      accountSessions.label(repo.scope, state.settings.displayName ?? "");
  }, [repo.scope, state.settings.displayName, connected]);
  const switchAccount = async (id: string) => {
    setBusy(true);
    try {
      await repo.changeAccount(() => accountSessions.switchTo(id));
    } catch (error) {
      if (error instanceof AccountLoginRequired) {
        setEmail(error.email);
        setPassword("");
        setSignup(false);
        setAddingAccount(true);
      }
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    void supabase?.auth.getSession().then(({ data }) => {
      if (active) setAccountEmail(data.session?.user.email ?? "");
    });
    return () => {
      active = false;
    };
  }, [repo.scope]);
  return (
    <section className="account-panel">
      <header className="account-panel-header">
        <span className="account-portrait" aria-hidden="true">
          {state.settings.displayName?.slice(0, 2).toLocaleUpperCase("fr") || (
            <UserRound />
          )}
        </span>
        <div>
          <h2>Mon compte</h2>
          <p>
            {connected
              ? state.settings.displayName || "Ton espace personnel"
              : "Ton espace personnel"}
          </p>
        </div>
        <button className="account-close" aria-label="Fermer" onClick={close}>
          <X size={20} />
        </button>
      </header>
      {supabase && (connected || savedAccounts.length > 0) && (
        <section
          className="account-switcher"
          aria-label="Changer de compte"
          aria-busy={busy}
        >
          <div className="account-section-heading">
            <ArrowLeftRight size={18} />
            <h3>Mes comptes</h3>
          </div>
          <div className="account-switcher-list">
            {savedAccounts.map((account) => (
              <div className="account-switcher-row" key={account.id}>
                <button
                  className="account-switch-target"
                  disabled={busy || account.id === repo.scope}
                  aria-label={`Utiliser ${account.email || account.name}`}
                  aria-pressed={account.id === repo.scope}
                  onClick={() => void switchAccount(account.id)}
                >
                  <span className="account-mini-avatar" aria-hidden="true">
                    {(account.name || account.email)
                      .slice(0, 2)
                      .toLocaleUpperCase("fr") || <UserRound size={18} />}
                  </span>
                  <span className="account-switch-label">
                    <strong>{account.name || account.email}</strong>
                    <small>
                      {account.id === repo.scope
                        ? "Compte actif"
                        : account.needsLogin
                          ? "À reconnecter"
                          : account.email}
                    </small>
                  </span>
                  {account.id === repo.scope && (
                    <Check size={18} aria-hidden="true" />
                  )}
                </button>
                {account.id !== repo.scope && (
                  <button
                    className="account-remove"
                    disabled={busy}
                    aria-label={`Retirer ${account.email || account.name} de cet appareil`}
                    onClick={() => {
                      try {
                        accountSessions.forget(account.id);
                      } catch {
                        notify("Impossible de retirer ce compte.");
                      }
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!addingAccount && (
            <button
              className="account-add"
              disabled={busy}
              onClick={() => {
                setEmail("");
                setPassword("");
                setSignup(false);
                setAddingAccount(true);
              }}
            >
              <Plus size={18} />
              Ajouter un compte
            </button>
          )}
          <p className="account-device-note">
            Ces comptes restent accessibles sur cet appareil.
          </p>
        </section>
      )}
      {!addingAccount && (
        <>
          <nav className="account-shortcuts" aria-label="Réglages du compte">
            <button
              onClick={() => modal(<Profile />)}
              aria-label="Mon profil et mes objectifs"
            >
              <UserRound />
              <span>Profil</span>
              <small>Infos et objectifs</small>
            </button>
            <button onClick={() => modal(<Appearance />)}>
              <Palette />
              <span>Apparence</span>
              <small>Thème et couleurs</small>
            </button>
            {connected && (
              <button
                onClick={() => modal(<Duo settings />)}
                aria-label="Partage Duo"
              >
                <HeartHandshake />
                <span>Duo</span>
                <small>Partage à deux</small>
              </button>
            )}
          </nav>
        </>
      )}
      <section className="account-connection">
        <div className="account-section-heading">
          {connected ? <Cloud size={19} /> : <HardDrive size={19} />}
          <h3>
            {addingAccount
              ? "Ajouter un compte"
              : connected
                ? "Synchronisation"
                : "Connexion"}
          </h3>
        </div>
        <p className="account-status" role="status">
          {repo.status}
        </p>
        {!supabase ? (
          <p>
            La synchronisation distante n’est pas configurée. Tes données sont
            enregistrées sur cet appareil. Renseigne le projet Supabase dans la
            configuration pour retrouver tes données sur iPhone et PC.
          </p>
        ) : connected && !addingAccount ? (
          <>
            <p className="account-email">
              {accountEmail || "Compte personnel connecté"}
              <small>Ton journal se synchronise automatiquement.</small>
            </p>
            <Button
              primary
              className="account-sync"
              onClick={() => void repo.sync()}
            >
              <RefreshCw size={18} /> Synchroniser
            </Button>
            <details className="account-transfer">
              <summary>
                <Upload size={16} />
                Importer depuis cet appareil
              </summary>
              <p className="note">
                Ajoute le journal enregistré en mode local à ton compte.
              </p>
              <Button
                onClick={() =>
                  modal(
                    <Confirm
                      title="Transférer l’historique de cet appareil ?"
                      action={() => repo.mergeGuest()}
                    >
                      Les données locales seront ajoutées à ton compte. Les
                      réglages et les enregistrements de même identifiant seront
                      remplacés par ceux de cet appareil ; les autres données du
                      compte seront conservées.
                    </Confirm>,
                  )
                }
              >
                Importer les données locales
              </Button>
            </details>
            {repo.docs
              .filter((d) => d.conflict)
              .map((d) => (
                <section className="card padded" key={d.key}>
                  <strong>Modification simultanée : {d.key}</strong>
                  <details>
                    <summary>Comparer les versions</summary>
                    <p>Version de cet appareil</p>
                    <pre>{JSON.stringify(d.value, null, 2)}</pre>
                    <p>Version distante</p>
                    <pre>{JSON.stringify(d.conflict?.value, null, 2)}</pre>
                  </details>
                  <Button onClick={() => void repo.resolve(d.key, false)}>
                    Conserver cet appareil
                  </Button>
                  <Button onClick={() => void repo.resolve(d.key, true)}>
                    Conserver la version distante
                  </Button>
                </section>
              ))}
            <Button
              className="account-signout"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await repo.changeAccount(async () => {
                    const { error } = await supabase!.auth.signOut({
                      scope: "local",
                    });
                    if (error) throw error;
                  });
                } catch (error) {
                  notify((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogOut size={17} /> Se déconnecter
            </Button>
          </>
        ) : (
          <>
            <p className="account-intro">
              Un compte chacun pour garder vos journaux séparés. Utilise le même
              compte sur tes propres appareils. Un nouveau compte démarre avec
              un journal vide.
            </p>
            <form
              className="account-login"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const result = await repo.changeAccount(async () => {
                    const current = await supabase!.auth.getSession();
                    if (current.error) throw current.error;
                    if (current.data.session)
                      accountSessions.remember(current.data.session);
                    return signup
                      ? await supabase!.auth.signUp({
                          email,
                          password,
                          options: {
                            emailRedirectTo: new URL(".", location.href).href,
                          },
                        })
                      : await supabase!.auth.signInWithPassword({
                          email,
                          password,
                        });
                  });
                  if (result.error) throw result.error;
                  setPassword("");
                  notify(
                    signup
                      ? "Compte créé. Vérifie tes e-mails si une confirmation est demandée."
                      : "Connexion réussie",
                  );
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field
                label="Adresse e-mail"
                type="email"
                name="username"
                autoComplete="username"
                required
                disabled={busy}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Field
                label="Mot de passe"
                type="password"
                name="password"
                autoComplete={signup ? "new-password" : "current-password"}
                minLength={8}
                required
                disabled={busy}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button primary type="submit" disabled={busy}>
                {busy
                  ? "Connexion…"
                  : signup
                    ? "Créer un compte"
                    : "Se connecter"}
              </Button>
              <Button disabled={busy} onClick={() => setSignup(!signup)}>
                {signup ? "J’ai déjà un compte" : "Créer un compte"}
              </Button>
            </form>
            {addingAccount && (
              <Button
                disabled={busy}
                onClick={() => {
                  setAddingAccount(false);
                  setPassword("");
                  setSignup(false);
                }}
              >
                Annuler
              </Button>
            )}
          </>
        )}
      </section>
      <details className="account-privacy">
        <summary>Confidentialité et données</summary>
        <p className="note">
          Les données de chaque compte et celles du mode local sont séparées.
          Les modifications simultanées d’un même enregistrement sont conservées
          jusqu’à résolution du conflit.
        </p>
      </details>
    </section>
  );
}
