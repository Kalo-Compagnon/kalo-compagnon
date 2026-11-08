# Catalogue alimentaire : audit et exploitation

## Périmètre actif : Open Food Facts

À la demande de l’utilisateur, Ciqual est reporté pendant sa maintenance. Le sélecteur ne charge plus son module de données, masque le filtre « Aliments bruts » et le message d’installation. Les filtres « Tous / Produits », les aliments personnels et Kalo, les récents et les favoris restent accessibles. OFF est la seule source distante active. L’importateur Ciqual est conservé pour une réactivation ultérieure ; les fiches Ciqual éventuellement déjà enregistrées ne sont pas supprimées et gardent leur provenance. Les notes Ciqual ci-dessous décrivent la préparation future, pas une intégration active.


## Système conservé

Le sélecteur est `FoodHub.tsx` (page `foods`), désormais délégué à `FoodPicker.tsx`. Le formulaire personnel, les quantités en g/ml, la composition de repas et les portions variables restent dans FoodHub. `LegacyMeals.tsx` conserve le catalogue initial et ses parcours. Les calculs Float32 de `domain.ts` sont inchangés : les entrées du journal stockent leurs calories calculées lors de l’ajout et ne dépendent pas d’une mise à jour ultérieure d’un catalogue.

`persistence.ts` conserve les documents alimentaires dans IndexedDB et les synchronise avec Supabase via `logger_put`, avec gestion des conflits. Les favoris, provenance et dates d’utilisation suivent ce mécanisme sans migration SQL. Les recherches OFF consultées disposent d’un cache IndexedDB distinct, local à l’appareil, plafonné à 40 recherches de 24 produits avec fraîcheur de 24 heures. Aucun catalogue externe complet n’est ajouté aux documents synchronisés. Seuls les aliments sélectionnés ou mis en favoris sont enregistrés dans le format interne.

Les exports JSON/CSV existants conservent les fiches et leur provenance (payload JSON du CSV). Les anciens repas et leurs calories ne sont pas recalculés. Les macros absentes d’une référence externe sont signalées dans `missingNutrients` ; les champs numériques internes restent compatibles avec les anciens calculs, mais ces macros sont omises dans les nouvelles entrées du journal. Les calories doivent être connues pour sélectionner une fiche. Une fiche sans calories peut être remplacée par une fiche personnelle renseignée volontairement.

## Ciqual : import officiel à effectuer

Les tentatives d’accès au site Ciqual (503) et au dépôt officiel ont échoué dans cet environnement. `src/ciqual-data.json` est donc volontairement vide. Aucun aliment existant n’est réétiqueté Ciqual. L’interface indique l’absence du référentiel. Le module de données est chargé séparément à l’ouverture du sélecteur, sans requête distante de recherche.

Référence officielle : [ANSES, Ciqual 2025](https://ciqual.anses.fr/cms/fr/node/19), [documentation 2025](https://ciqual.anses.fr/cms/sites/default/files/inline-files/Table%20Ciqual%202025%20doc%20FR_2025_11_19.pdf), dépôt DOI `10.57745/RDMHWY`.

1. Télécharger le classeur officiel le plus récent et conserver le fichier source, sa date/version et les conditions de réutilisation fournies avec lui. Vérifier la Licence Ouverte et l’attribution ANSES avant redistribution.
2. Exporter la feuille de composition en CSV UTF-8 séparé par des points-virgules, avec ses en-têtes officiels (`alim_code`, `alim_nom_fr`, énergie réglementaire en kcal/100 g, et éventuellement protéines/glucides/lipides).
3. Exécuter `node scripts/prepare-ciqual.mjs chemin/ciqual.csv 2025`.
4. Exécuter `node --test tests/ciqual-import.mjs`, `npm test`, `npm run build` puis les tests navigateur. Le script refuse les colonnes indispensables absentes et les codes dupliqués, ne transforme ni traces ni limites de quantification en zéro et conserve la version.

La base Ciqual reste dans son fichier propre ; les réponses OFF restent dans leur cache distinct. Pas de fichier fusionné redistribué. Attribution dans le sélecteur, identifiant et source conservés dans chaque fiche sélectionnée.

## Open Food Facts

[Documentation officielle](https://openfoodfacts.github.io/openfoodfacts-server/api/) : 10 recherches/minute/IP et 15 lectures de produits/minute/IP. La recherche locale est instantanée ; la recherche distante se lance volontairement avec le bouton ou Entrée, jamais à chaque caractère. Délai minimal de 650 ms, espacement conservateur de 6,1 s entre demandes distantes, limite de 24 résultats, annulation au changement de texte/filtre/écran, timeout de 12 s et aucune relance automatique. Codes-barres saisis/collés de 8 à 14 chiffres, aucun faux scanner.

Les champs demandés sont limités au nom, marque, code, unité et nutriments. kcal/100 g (ou ml pour un produit liquide identifié par son unité de conditionnement) et conversion kJ / 4,184 si nécessaire ; aucune conversion d’une valeur par portion en valeur pour 100. Lorsque l’unité de conditionnement manque, la base OFF normalisée est affichée en g.

Les navigateurs imposent leur User-Agent HTTP : l’URL fournit l’identification KaloCompagnon. Avant diffusion publique, déclarer l’utilisation via le formulaire indiqué dans la documentation OFF et confirmer avec OFF l’identification du client web ; un proxy avec User-Agent explicite sera nécessaire si OFF l’exige. Aucun secret ni identifiant utilisateur n’est transmis. Les données OFF sont sous [ODbL](https://world.openfoodfacts.org/terms-of-use), attribution visible dans le sélecteur. La politique de limitation ne prétend pas coordonner les autres applications ou onglets du même réseau.

## Build et vérifications

Vite utilise une base relative compatible GitHub Pages. Le build existant prépare `dist`, `assets`, `index.html` et les pages d’installation locales ; il ne publie pas sur GitHub. Aucun commit/push ou déploiement effectué.

- `npm test` : tests métier, persistance, synchronisation et recherche.
- `node --test tests/ciqual-import.mjs` : import CSV Ciqual.
- `npm run build` : TypeScript, Vite et préparation statique.
- `npm run test:browser` : suite existante, serveur local `node server/index.mjs` sur 8787.
- `node tests/food-picker-browser.mjs` : OFF simulé, favoris après rechargement, journal, filtres, erreur réseau et 320/390/768/1440 px. Pas d’appel OFF réel pendant les tests.

La recherche des données déjà stockées et du module Ciqual chargé est locale. Le projet désenregistre actuellement les service workers dans `main.tsx` : cette refonte n’ajoute pas de garantie de démarrage de toute la PWA hors ligne. Les essais réseau OFF réels et sur iPhone physique restent à faire.


## Sélecteur directement visible dans Repas

Le sélecteur FoodPicker est maintenant intégré dans Meals.tsx sous le budget calorique. La sélection ouvre FoodHub sur la quantité ; la création personnelle et la modification ouvrent le formulaire existant. La commande secondaire conserve les repas enregistrés, la composition et les extras. FoodHub conserve également son sélecteur pour les ingrédients. La page du site en production ne sera actualisée que lors d'un déploiement explicitement autorisé.

## Retrait du Catalogue Kalo

Les fiches non personnelles du catalogue initial sont exclues du sélecteur (recherche, catalogue, récents et favoris) via selectableFood. Les aliments personnels et les produits Open Food Facts restent accessibles. Les fiches historiques sont conservées dans le stockage pour que les recettes et les anciens repas continuent de fonctionner ; aucun aliment historique n'est réétiqueté OFF. Le test navigateur vérifie l'absence de lignes Kalo et le test métier vérifie la conservation des archives.

## Catalogue Kalo personnel, marque et aliments à la pièce

Le filtre « Catalogue Kalo » et cette provenance désignent désormais les créations personnelles uniquement ; les anciens aliments prédéfinis restent exclus. Le champ Marque est facultatif, placé sous le nom, enregistré dans le document alimentaire et indexé par la recherche.

L'unité « unité (pièce) » utilise une base nutritionnelle de 1 pièce. Les bases g et ml restent à 100. Les noms des champs internes historiques (kcalPer100, etc.) sont conservés pour la compatibilité ; referenceAmount détermine la base de calcul et l'affichage. La quantité initiale est de 1 pour les pièces, de 100 pour g/ml. Le calcul s'applique aussi aux ingrédients, repas et portions variables. Les exports JSON/CSV conservent marque et unité ; le CSV affiche « 1 unité » pour cette base.

OFF : aucun chargement automatique d'un catalogue complet. Saisir au moins deux caractères puis cliquer sur la loupe, sur « Rechercher dans Open Food Facts » ou appuyer sur Entrée. Les résultats consultés sont ensuite disponibles dans le cache local. Lancer explicitement OFF depuis le filtre personnel revient à Tous, afin que les résultats OFF ne restent pas masqués. Les états vides du Catalogue indiquent la marche à suivre.

Validation : tests de calcul par pièce, recette, sauvegardes JSON/CSV, recherche par marque et test navigateur custom-food-browser.mjs (création, 2 pièces, 360 kcal pour la fiche de test à 180 kcal/pièce, persistance et édition).
