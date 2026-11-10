# Kermit Cuisto

Dernier controle apres confirmation des secrets : CORS est maintenant valide (OPTIONS 204 pour le site actif et les quatre origines locales configurees, origine tierce refusee). Les appels anonymes/jetons malformes restent refuses en 401. Il reste a valider un appel Gemini authentifie depuis l'application ; le blocage CORS mentionne dans le compte rendu precedent est resolu.

Etat de mise en service actualise le 10 novembre 2026 : migration appliquee, deux comptes de la paire Duo actives et fonction distante `kermit` version 1 deployee avec verification JWT. RLS et droits RPC verifies. Le site actif est `https://kalo-compagnon.github.io/kalo-compagnon/`. CORS refuse encore cette origine : les secrets d'origines doivent etre completes dans Supabase, le plugin ne permettant pas leur gestion. L'appel Gemini authentifie reste a verifier. Voir `KERMIT-HANDOFF.md` pour le detail des operations et les etapes restantes. Les constats d'absence de deploiement ci-dessous decrivent l'intervention initiale.

Implémentation locale, sans migration distante, déploiement ou changement de facturation.

Diagnostic du premier essai réel : une requête publique `OPTIONS` vers `/functions/v1/kermit` du projet configuré a retourné HTTP 404, `NOT_FOUND`, `Requested function was not found`. La fonction est absente du projet distant. Ce contrôle ne transmet aucun repas, ne nécessite aucun jeton et n'appelle pas Gemini. Le client affiche désormais explicitement que Kermit n'est pas encore activé au lieu de suggérer un problème de connexion. Les étapes de configuration ci-dessous restent nécessaires ; les tests simulés ne constituent pas une validation du service distant.

## Audit et intégration

Révision de l'interface selon le retour utilisateur : le bouton texte et le formulaire `Sheet` sont remplacés par un lanceur rond à toque en bas à droite et un panneau de messagerie. L'ouverture se révèle depuis le lanceur ; bulles utilisateur à droite, Kermit à gauche, en-tête fixe et barre de saisie compacte avec menu photo « + ». Le dialogue natif et ses protections de fermeture sont conservés. Les couleurs proviennent toujours du thème/accent Kalo ; l'animation respecte la préférence de réduction des mouvements.

- `src/Meals.tsx` est l'écran Repas/Alimentation. Il ouvre `Kermit` avec le mécanisme `modal` existant ; aucun nouvel onglet.
- `src/ui.tsx` fournit `Sheet`, `Button`, `Field` et les conventions photo. Le dialogue natif de `App.tsx` assure le focus modal. Une fermeture annulable permet au chat de confirmer bouton, Échap et arrière-plan. Un état d'historique temporaire traite le retour navigateur.
- `campus-theme.css`, `appearance.css` et `accent.css` restent intacts. Les nouvelles règles CSS concernent uniquement le défilement, les retours à la ligne et les dimensions des photos. La hauteur suit `visualViewport` pour le clavier iOS.
- `Entry`, `timestamp(day)`, `calorieDetails` et `update` sont réutilisés. Aucun calcul alimentaire existant n'est changé. Une estimation crée une entrée `meal` avec le total vérifié, sans inventer de macronutriments. La date est celle sélectionnée à l'ouverture. Il n'existe pas d'étape obligatoire de catégorie de repas dans ce parcours.
- Les poids inconnus restent `null` dans le contrat et explicites dans la note persistante ; seuls les poids connus alimentent `calorieDetails`. L'éditeur existant affiche aussi la note pour les entrées Kermit.
- `persistence.ts` fournit le client Supabase Auth et les écritures IndexedDB/synchronisation. La confirmation d'ajout suit la réussite de l'écriture locale, comme les autres ajouts ; la synchronisation distante conserve son fonctionnement habituel, éventuellement différé.
- Le dépôt n'avait ni Edge Function ni configuration de fonctions. L'état Git initial était propre. Les bundles statiques sont régénérés par le script de build existant, sans publication distante.

## Contrat et confidentialité

`functions/_shared/kermit.ts` valide requêtes et réponses côté serveur et application. `kermit-handler.ts` porte le prompt, le schéma Gemini et le traitement HTTP testable sans Deno. `functions/kermit/index.ts` adapte Supabase et Deno.

Les messages, photos, contexte et estimations vivent uniquement dans les états/refs du composant. Aucun historique n'est écrit dans Supabase, IndexedDB, localStorage, Storage ou sauvegardes. Seul un ajout explicite écrit une entrée du journal. Fermer, recharger, se déconnecter ou changer de compte détruit le contexte ; les appels en cours sont annulés côté client. Une requête déjà partie peut néanmoins se terminer côté serveur/Google.

Les photos sont décodées dans le navigateur, orientées par son décodeur, redimensionnées à 1024 px maximum et réencodées JPEG (métadonnées originales non transmises). Limites : fichier initial 10 Mo, JPEG encodé 750 000 caractères, une photo par appel, corps HTTP 850 000 octets. Le serveur vérifie signature et dimensions JPEG. HEIC/HEIF exige un navigateur sachant décoder ce format ; sinon l'interface demande un JPEG. Aucun accès caméra persistant n'est demandé.

Chaque photo n'est transmise à Google qu'au tour où elle est jointe. Les tours suivants utilisent le texte de l'analyse. Pour réexaminer les pixels d'une photo ancienne, Kermit doit demander qu'elle soit jointe à nouveau. Contexte limité à 12 échanges complets et 48 000 caractères ; au-delà, ouvrir une nouvelle conversation. Les messages d'un appel échoué restent visibles mais n'entrent pas dans le contexte Gemini ; le brouillon est rétabli pour une reprise manuelle.

Un `meal_id` conserve le lien entre corrections ; une seule fiche reste active par repas, avec les anciens messages visibles. Le bouton est verrouillé immédiatement pendant l'écriture. L'identifiant déterministe de l'entrée empêche un doublon dans la session ; les corrections ultérieures n'écrasent jamais une entrée enregistrée. Aucun outil/action n'est exposé au modèle.

Google applique ses propres conditions de traitement et de conservation. L'absence de stockage Kalo ne garantit pas la suppression immédiate chez Google. Aucun prompt, photo, jeton ou réponse brute Google n'est journalisé par la fonction.

## Quotas

Migration : `migrations/20261110200000_kermit_quotas.sql`.

- Comptes explicitement autorisés dans `kermit_users`, avec leur UUID Auth. Aucun compte n'est autorisé par défaut.
- 50 appels par compte et par journée **UTC**, réinitialisation à 00:00 UTC.
- Ensemble Kalo : 100 appels/jour, 10 appels par fenêtre glissante de 60 secondes, 180 000 tokens réservés sur cette fenêtre. Ces plafonds gardent une marge sous les limites de référence 500 RPD / 15 RPM / 250 000 TPM.
- Réservation conservatrice : octets UTF-8 du contexte/prompt/schéma + 16 384 pour une image de dimensions bornées + 4 096 de sortie maximale. Les réservations ne sont pas réduites après réponse.
- Le verrou transactionnel global PostgreSQL sérialise contrôle et insertion entre utilisateurs/instances. Tables sous RLS sans politique client ; droits de table retirés à `anon` et `authenticated`. RPC réservée à `service_role`, jamais au navigateur.
- Authentification, clé, formats et limites sont vérifiés avant réservation. Un refus préalable ne consomme rien. Après réservation, l'appel est conservé même en cas de déconnexion, timeout, erreur réseau, erreur Google ou JSON invalide : Google peut déjà l'avoir compté. Une interruption exceptionnelle du processus entre réservation et envoi peut aussi être comptée, par prudence.
- Aucun retry automatique. Un 429 Google est présenté sans détails internes. Les compteurs ne sont jamais affichés dans le parcours normal.
- Ces protections ne peuvent pas mesurer les appels d'autres applications utilisant le même projet Google. La marge n'est pas une garantie : les limites Google restent souveraines. Pour garantir la disponibilité Kalo, utiliser un projet dédié ou coordonner tous les consommateurs. La fonction n'active aucun niveau payant.
- Nettoyage des compteurs de plus de sept jours à la réservation suivante. Les compteurs ne contiennent que UUID, horodatage et budget de tokens.

## Configuration Supabase à effectuer après autorisation

1. Examiner puis appliquer uniquement la nouvelle migration sur le projet existant. Le fichier présent dans Git n'est pas une migration déjà exécutée. Ne pas réappliquer `schema.sql`.
2. Ajouter les **deux UUID réels** dans `public.kermit_users` depuis le SQL Editor administrateur. Ne pas ajouter ces identités au dépôt :

   Si la paire Duo privée est déjà configurée, exécuter plutôt `supabase/kermit-activation.sql` : il reprend les deux UUID côté serveur, est réexécutable et refuse une paire ambiguë ou une liste d'accès contenant un autre compte. Aucune identité n'est copiée dans le dépôt.

   ```sql
   insert into public.kermit_users(user_id)
   values ('UUID_DU_COMPTE_1'), ('UUID_DU_COMPTE_2');
   ```

3. Définir les secrets serveur dans Supabase :
   - `GEMINI_API_KEY` : clé privée existante, jamais dans un nom `VITE_`, fichier suivi ou commande qui l'affiche.
   - `GEMINI_MODEL=gemini-3.5-flash-lite` (valeur par défaut centralisée).
   - `KERMIT_ALLOWED_ORIGINS` : origines exactes séparées par virgules, par exemple `https://proprietaire.github.io` ; une origine n'inclut pas le chemin du dépôt. Ajouter les origines locales uniquement pour les essais locaux.
   - `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` : variables serveur fournies par Supabase.
4. Vérifier la stratégie de vérification JWT du gateway avec les jetons réellement émis par ce projet. Conserver les protections Supabase ; la fonction vérifie toujours le jeton avec `auth.getUser`. Aucun `--no-verify-jwt` n'est prévu.
5. Vérifier dans le projet Google la disponibilité **réelle** du modèle pour cette clé, ses quotas, le niveau de facturation et les paramètres de confidentialité.
6. Après autorisation seulement : déployer la fonction `kermit`, tester avec les deux comptes, puis publier le frontend par la procédure GitHub Pages existante. Aucun déploiement n'a été réalisé ici.

Les politiques RLS et droits effectifs doivent être revérifiés sur l'environnement distant. Tester les appels anonymes/expirés et le refus d'un compte tiers, puis une estimation texte/photo et une correction sur iPhone Safari et PWA installée.

## Documentation officielle consultée

- [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) : identifiant `gemini-3.5-flash-lite`, entrées multimodales, sorties structurées. Aucun modèle de génération d'images.
- [Sorties structurées](https://ai.google.dev/gemini-api/docs/structured-output) : JSON avec schéma ; cela ne prouve pas l'exactitude nutritionnelle.
- [Conditions Gemini API](https://ai.google.dev/gemini-api/terms), [tarification](https://ai.google.dev/gemini-api/docs/pricing) : vérifier les conditions applicables à la mise à disposition d'un client dans l'EEE, ainsi que les sections Paid Services et traitement des données. Le quota gratuit affiché ne suffit pas à établir l'autorisation d'exploitation. Aucun niveau payant n'a été activé ; aucune clé/console privée du projet n'a été consultée.

## Vérifications

Commandes : `npm test`, `npm run build`, `npm run test:browser`, et `npm run test:browser:kermit` pour le parcours Kermit isolé. Sous PowerShell avec scripts désactivés, utiliser `npm.cmd`.

Les tests métier/HTTP simulent Gemini et l'authentification ; les tests SQL exécutent la migration dans PostgreSQL embarqué PGlite. Ils testent permissions, quotas indépendants, réservations rapprochées et budget tokens. PGlite sérialise ses requêtes : cela ne remplace pas un test de charge entre plusieurs connexions PostgreSQL distantes.

Les tests navigateur utilisent Chromium mobile et des réponses Supabase/Gemini simulées, sans données réelles. Captures locales dans `qa/kermit-iphone-light.png` et `qa/kermit-iphone-dark.png` (non suivies). Cela ne remplace pas un essai Safari/PWA sur appareil réel.

Non vérifiés ici : runtime Deno déployé, gateway Supabase réel, clé/modèle Google du projet, quotas/billing réels, politiques distantes et décodeur HEIC/clavier/gestes sur iPhone physique.

Résultats de cette intervention :

- `npm test` : **93 tests réussis**, dont 12 nouveaux tests Kermit (contrat, conversion journal, HTTP et SQL).
- `npm run build` : réussi. Avertissement Vite sur `persistence.ts` importé à la fois statiquement et dynamiquement ; il n'empêche pas le build.
- `npm run test:browser:kermit` : réussi (texte, correction, photo, erreurs/quota/hors ligne, ajout unique, fermeture/annulation/Échap/retour, disparition après rechargement/déconnexion, absence de photos/prompts dans IndexedDB, largeurs 320/390/768/1440, clair/sombre et accent).
- `npm run test:browser` : échec au premier script, `tests/browser.mjs:67`, qui cherche `/Calories estim/` dans l'éditeur de repas. Le composant existant affiche déjà « Total des calories (kcal) » pour un repas. Ce libellé n'a pas été changé ici.
- Les 16 scripts suivants ont été exécutés séparément : 15 réussissent ; `browser-extended.mjs:85` échoue pour le même sélecteur ancien. Les tests concernés n'ont pas été modifiés dans cette intervention.
- `git diff --check` : réussi. Aucun nom de secret serveur ni prompt système trouvé dans les sources frontend ou bundles publiables lors du contrôle.
