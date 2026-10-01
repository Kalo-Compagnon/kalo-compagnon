import { useState } from "react";
import { useApp, Button, Field, Sheet, Confirm } from "./ui";
import { supabase } from "./persistence";
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
            `logger_export_${dayKey()}.csv`,
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
            `logger_backup_${dayKey()}.json`,
            exportJSON(state),
            "application/json",
          )
        }
      >
        Sauvegarde complète (.json)
      </Button>
      <h2 className="section-title">Importer des données</h2>
      <p className="note">
        JSON ou CSV Logger. Vérification avant import ; les données existantes
        sont conservées, sauf les enregistrements de même identifiant remplacés
        par l’import.
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
  const { repo, notify, modal } = useApp(),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [signup, setSignup] = useState(false);
  const connected = repo.scope !== "guest";
  return (
    <Sheet title="Synchronisation" subtitle={repo.status}>
      {!supabase ? (
        <p>
          La synchronisation distante n’est pas configurée. Tes données sont
          enregistrées sur cet appareil. Renseigne le projet Supabase dans la
          configuration pour retrouver tes données sur iPhone et PC.
        </p>
      ) : connected ? (
        <>
          <p>
            Compte connecté. Les changements sont synchronisés automatiquement.
          </p>
          <Button primary onClick={() => void repo.sync()}>
            Synchroniser maintenant
          </Button>
          <Button
            onClick={() => modal(<Confirm title="Transférer l’historique de cet appareil ?" action={() => repo.mergeGuest()}>
              Les données locales seront ajoutées à ton compte. Les réglages et les enregistrements de même identifiant seront remplacés par ceux de cet appareil ; les autres données du compte seront conservées.
            </Confirm>)}
          >
            Importer les données locales de cet appareil
          </Button>
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
            onClick={() =>
              void supabase!.auth.signOut().then(({ error }) => {
                if (error) notify(error.message);
              })
            }
          >
            Se déconnecter
          </Button>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const result = signup
                ? await supabase!.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: new URL('.', location.href).href },
                  })
                : await supabase!.auth.signInWithPassword({ email, password });
              if (result.error) throw result.error;
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
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Mot de passe"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button primary type="submit" disabled={busy}>
            {busy ? "Connexion…" : signup ? "Créer un compte" : "Se connecter"}
          </Button>
          <Button onClick={() => setSignup(!signup)}>
            {signup ? "J’ai déjà un compte" : "Créer un compte"}
          </Button>
        </form>
      )}
      <p className="note">
        Les données de chaque compte et celles du mode local sont séparées. Les
        modifications simultanées d’un même enregistrement sont conservées
        jusqu’à résolution du conflit.
      </p>
    </Sheet>
  );
}
