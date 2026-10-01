# Logger Web — installation et architecture

Conversion React/TypeScript séparée du projet Android. Référence : [ANDROID_ANALYSIS.md](ANDROID_ANALYSIS.md). Couverture et limites : [CONVERSION_STATUS.md](CONVERSION_STATUS.md).

## Démarrage

Prérequis : Node.js 22.12+ ou 24, npm. Pour le monitoring FIT : JDK 17+ pour compiler et Java 8+ pour exécuter ; le script détecte aussi le JDK d'Android Studio sous Windows.

```powershell
cd D:\ANDROID\Logger\webapp
npm.cmd ci
npm.cmd run build
npm.cmd run build:fit
npm.cmd run serve
```

Ouvrir **http://localhost:8787**. `LANCER-WEBAPP.cmd` exécute ces étapes. `JAVA_BIN` et `JAVAC_BIN` permettent d'indiquer les exécutables Java. Le serveur sert l'application compilée et le décodeur Garmin.

Développement : `npm.cmd run dev`. Laisser aussi `npm.cmd run serve` actif pour le monitoring : Vite transmet `/api/fit-monitoring` au port 8787.

## Supabase et synchronisation

Sans configuration distante, les données sont enregistrées uniquement dans IndexedDB sur cet appareil. Aucun compte distant ni déploiement n'est créé automatiquement.

1. Créer un projet Supabase et exécuter [supabase/schema.sql](supabase/schema.sql) dans son SQL Editor.
2. Copier `.env.example` en `.env.local`. Remplir `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` avec l'URL et la clé publique. Ne jamais placer une clé `service_role` dans le frontend.
3. Configurer dans Supabase Auth l'URL du site, les redirections et l'authentification e-mail/mot de passe.
4. Recompiler puis redémarrer le serveur.
5. Logger : Global > Exporter toutes mes données > Synchronisation iPhone / PC. Créer un compte puis utiliser le même compte sur les deux appareils.
6. « Importer les données locales de cet appareil » transfère le mode local vers le compte. En cas de valeurs communes différentes, exporter le mode local puis importer avec vérification.

Écriture locale avant envoi ; synchronisation après modification, toutes les 15 secondes et au retour du réseau/du premier plan. Les suppressions restent sous forme de tombstones. Les révisions sont vérifiées sur le serveur : un conflit conserve les deux valeurs jusqu'au choix dans Synchronisation. Les comptes et le mode local ont des caches séparés.

La table est protégée par RLS. La fonction d'écriture utilise l'identité authentifiée, pas une identité fournie par le navigateur. Les tests simulés couvrent conflits et reconnexion ; un test Supabase réel reste nécessaire.

## Données

JSON complet avec photos web, mensurations et réglages. CSV web compatible avec les colonnes Android et `payload_json` pour préserver exactement les données à la réimportation. Import CSV Android avec aperçu avant fusion. Les identifiants communs sont remplacés après confirmation, les autres données conservées.

Le CSV Android ne contient pas les fichiers photos, les mensurations SharedPreferences, les empreintes FIT ni tous les réglages. Le web indique ces omissions. Ne pas réimporter les FIT déjà inclus dans ce CSV, faute d'empreintes disponibles.

L'ancien prototype et son localStorage sont conservés. Ses totaux ne sont pas transformés en historique inventé.

## Déploiement et FIT

Les sessions sportives sont décodées dans le navigateur avec Garmin JS **21.214.0**. Le monitoring quotidien utilise `server/MonitoringBridge.java` avec le **MonitoringReader original** et le même SDK Java qu'Android.

Local : écoute 127.0.0.1. Production : `NODE_ENV=production` active l'écoute réseau et impose Supabase Auth au service FIT. Configurer `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` à l'exécution (les variables VITE sont aussi reconnues). HTTPS est nécessaire sur iPhone pour les API sécurisées.

Le Dockerfile construit frontend et service Java. Passer les variables VITE en arguments de construction, et les variables Supabase à l'exécution. Aucun déploiement n'a été effectué. Une publication statique de `dist/` doit ajouter un service `/api/fit-monitoring` pour les FIT quotidiens.

## Code et tests

- `src/domain.ts` : modèles et formules Float32 ; `persistence.ts` : stockage et synchro ; `transfer.ts` : import/export validés.
- Les composants React portent les noms des écrans. `LegacyMeals.tsx` conserve les fonctions historiques.
- Les PNG et les chemins vectoriels viennent d'Android. `scripts/extract-catalog.mjs` extrait les 60 plats de Kotlin.
- `tests/AndroidFloatReference.java` génère les références indépendantes : 1 000 entrées et 3 000 résultats calculés en Java.

```powershell
npm.cmd test
npm.cmd run build
node tests/fit-service.mjs # serveur sur 8787
```

Le manifeste permet l'ajout à l'écran d'accueil. Le rechargement entièrement hors ligne n'est pas assuré. Le suivi physique historique est accessible depuis Données.

Licences : Garmin FIT dans `server/lib/GARMIN-LICENSE.txt` et le package npm ; Roboto dans `@fontsource/roboto`. Les ressources Android restent celles du projet fourni.

## Vérifications navigateur

Playwright a été autorisé et exécuté. Les 19 tests du domaine/stockage/synchronisation, les parcours navigateur et les quatre formats passent. Rapport visuel et limites : [design-qa.md](design-qa.md). Captures dans qa/.

Pour rejouer les parcours, garder le serveur sur localhost:8787 et utiliser :

```powershell
npx.cmd playwright install chromium
npm.cmd run test:browser
```

CHROMIUM_BIN permet de choisir un exécutable Chromium existant. Les profils de test sont isolés des données utilisateur. Les tests ne remplacent pas Safari sur iPhone réel ni un projet Supabase réel.
