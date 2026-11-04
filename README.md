# Kalo Web — installation et architecture

**GitHub Pages :** le site compilé est inclus à la racine. Conserver **Deploy from a branch → main → / (root)**. Après une modification : `npm.cmd run build`, puis committer les sources et les fichiers générés (`index.html`, `assets/`, `manifest.webmanifest`, `.nojekyll`). L'entrée React de développement est `app.html`.

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
5. Kalo : Global > Exporter toutes mes données > Synchronisation iPhone / PC. Créer un compte puis utiliser le même compte sur les deux appareils.
6. « Importer les données locales de cet appareil » transfère le mode local vers le compte. En cas de valeurs communes différentes, exporter le mode local puis importer avec vérification.

Écriture locale avant envoi ; synchronisation après modification, toutes les 15 secondes et au retour du réseau/du premier plan. Les suppressions restent sous forme de tombstones. Les révisions sont vérifiées sur le serveur : un conflit conserve les deux valeurs jusqu'au choix dans Synchronisation. Les comptes et le mode local ont des caches séparés.

La table est protégée par RLS. La fonction d'écriture utilise l'identité authentifiée, pas une identité fournie par le navigateur. Les tests simulés couvrent conflits et reconnexion ; un test Supabase réel reste nécessaire.

## Utilisation à deux

Chacun crée son compte depuis « Mode local · Se connecter » sur l’écran principal, puis renseigne son prénom, ses paramètres de calcul et ses objectifs. Le prénom du profil apparaît ensuite dans l’accès au compte ; l’adresse e-mail est affichée dans « Mon compte ». Le profil reste modifiable depuis le compte ou depuis Données.

Utiliser le même compte sur ses propres appareils, et un compte différent pour chaque personne. Les historiques, photos, aliments personnels, recettes et objectifs sont séparés. Le catalogue alimentaire de départ est identique pour tous, mais les modifications restent personnelles. Aucun partage automatique entre comptes n’est prévu.

Un nouveau compte démarre vide. Pour récupérer l’ancien historique, se connecter au compte de son propriétaire puis choisir « Importer les données locales de cet appareil » dans Mon compte. Cette opération demande confirmation et conserve la copie locale. Le mode local reste un espace unique par navigateur : il ne sert pas à héberger deux profils distincts.

## Style graphique

La présentation reprend la charte du site [Campus](https://lowtaire.github.io/sched/) : fond crème, surfaces blanches, violet et cartes pastel. DM Sans et Manrope sont intégrées localement via Fontsource ; aucun appel à Google Fonts n’est nécessaire. Les adaptations sont regroupées dans `src/campus-theme.css`. Navigation latérale à partir de 1100 px, barre inférieure sur mobile et tablette. Les calculs, imports et données restent identiques.

Le menu **Compte > Apparence**, disponible aussi dans Données, propose Clair, Sombre ou Suivre l’appareil et une seule **couleur d’accent** pour le halo, les boutons, la navigation, les liens et la courbe de poids. Le choix déjà enregistré pour le halo devient automatiquement l’accent global. **Les apports restent rouges et les dépenses vertes**, dans les cartes, chiffres et graphiques associés, indépendamment de l’accent choisi. Les fonds des boutons conservent la couleur exacte ; les textes noirs ou blancs et les nuances des surfaces s’adaptent pour rester lisibles en clair et sombre. L’aperçu est immédiat ; Enregistrer conserve les préférences du compte et Annuler restaure l’apparence enregistrée. Ces réglages sont synchronisés et inclus dans les sauvegardes. Le stockage et le format interne `logger-web` restent compatibles avec les anciennes données.

## Données

Le métabolisme utilise maintenant la date de naissance pour calculer l’âge et la moyenne des **sept dernières journées comportant une pesée**, jusqu’à la journée considérée. Les jours sans pesée sont ignorés ; avec moins de sept relevés, seuls les relevés disponibles sont moyennés. Le poids moyen est affiché en lecture seule dans le profil et le calcul du métabolisme. Une nouvelle pesée, sa correction ou sa suppression actualise automatiquement le métabolisme et le budget du jour. Les métabolismes déjà enregistrés des journées passées sont conservés. Sans pesée, le profil peut être enregistré mais aucun métabolisme automatique n’est calculé ; ajouter un relevé dans « Poids sur la balance ». Les anciens profils sans date de naissance conservent leur métabolisme existant jusqu’à leur mise à jour, sans inventer de date de naissance.

Le budget alimentaire est dynamique : dépense estimée de la journée − déficit choisi. Le reste à manger soustrait ensuite les kcal des repas renseignés. Il est affiché dans Repas et sous les totaux du jour sur l’accueil. Le déficit reste modifiable dans le profil, le bilan global ou la carte des calories de Repas. Pas de budget affiché sans métabolisme ; les repas sans calories sont signalés comme estimation partielle. Les anciens objectifs fixes sont conservés dans les fichiers pour compatibilité mais ne pilotent plus le budget affiché ; `target_kcal` exporte désormais le budget calculé.

Dans Activité, « Activité sans pas ni fichier » permet d’enregistrer un total quotidien de kcal dépensées calculé ailleurs (pompes, musculation, etc.). Ce total s’ajoute aux dépenses issues des pas et des FIT, sans créer de pas. Une nouvelle saisie remplace le total manuel de la journée ; 0 le retire du bilan. Ne pas inclure une activité déjà comptée dans un FIT ou dans les pas. L’historique, la synchronisation et les sauvegardes JSON/CSV conservent cette valeur (`manualActivityCalories`, colonne CSV `manual_activity_kcal`).

Pour modifier une journée terminée, maintenir sa ligne appuyée environ 0,65 seconde, puis choisir « Modifier cette journée ». Un clic simple n’active plus le mode modification. Un déplacement ou une interruption du geste annule l’appui. Au clavier, Entrée ou Espace ouvre les mêmes options.

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

Licences : Garmin FIT dans `server/lib/GARMIN-LICENSE.txt` et le package npm ; DM Sans et Manrope dans les packages `@fontsource-variable` correspondants (OFL-1.1). Les ressources Android restent celles du projet fourni.

## Vérifications navigateur

Playwright a été autorisé et exécuté. Les 38 tests du domaine, stockage, synchronisation, profils, apparence, budget et métabolisme ainsi que les parcours navigateur passent. Le style Campus a été vérifié à 320, 390, 768, 844 et 1440 px, et les parcours existants à 1920 et 2560 px. Rapport visuel et limites : [design-qa.md](design-qa.md). Captures dans qa/.

Pour rejouer les parcours, garder le serveur sur localhost:8787 et utiliser :

```powershell
npx.cmd playwright install chromium
npm.cmd run test:browser
```

CHROMIUM_BIN permet de choisir un exécutable Chromium existant. Les profils de test sont isolés des données utilisateur. Les tests ne remplacent pas Safari sur iPhone réel ni un projet Supabase réel.
