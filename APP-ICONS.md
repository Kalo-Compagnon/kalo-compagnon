# Icônes par accent — implémentation locale

Le choix de couleur dans Apparence est limité aux cinq couleurs déjà proposées : lavande, pêche, sauge, bleu et rose. Il n’y a plus de champ permettant de choisir une couleur arbitraire. La palette est centralisée dans `src/appearance-presets.ts` et les préférences continuent d’utiliser `settings.haloColor`, sans deuxième stockage ni changement de synchronisation.

## Logo

Le SVG original `public/assets/icon.svg` est conservé intact. Le générateur réutilise ses éléments, dimensions, positions, proportions, opacité et tracés. Seules trois couleurs sont remplacées conformément à la demande : fond toujours sombre `#17181e`, cercle dans l’accent foncé et tracés centraux dans l’accent normal. Les PNG ont un fond sombre opaque, y compris dans les coins ; aucune ombre ni décoration n’est ajoutée.

## Ressources et build

Pour chacune des cinq couleurs, `public/assets/app-icons/v1/<hex>/` contient :

- `icon-32.png` : favicon.
- `icon-180.png` : apple-touch-icon.
- `icon-192.png` et `icon-512.png` : installation PWA.
- `logo.svg` : variante vérifiable depuis le SVG source.
- `manifest.webmanifest` : manifeste statique associé à la couleur.

Le manifeste racine et `apple-touch-icon.png` fournissent le repli lavande sans JavaScript. Les identités, scopes et URL de démarrage des cinq manifestes se résolvent tous vers la racine de la même application, y compris sous `/kalo-compagnon/`.

`npm.cmd run generate:icons` génère les ressources depuis le logo source avec Chromium/Playwright déjà présent dans le projet. Ce n’est pas une dépendance de production et aucun serveur de génération n’est ajouté. Les PNG sont fournis dans le dépôt ; le build ordinaire n’a donc pas besoin d’un navigateur installé. Il vérifie les variantes SVG, signatures et dimensions PNG ainsi que les manifestes avant de compiler.

Le script existant de préparation statique copie les ressources vers `assets/app-icons/`, actualise le manifeste racine et génère cinq entrées `install/<hex>/index.html`. Leurs balises d’icône et de manifeste sont correctes dans le HTML initial, avant toute exécution de JavaScript. Un élément `base` fait résoudre leurs ressources vers la racine du projet. Aucun blob ni data URL n’est utilisé pour l’installation.

Les noms sont versionnés (`v1`) pour les caches immuables. Si le dessin original change un jour, régénérer les ressources et versionner les nouvelles URL ; un simple changement d’accent sélectionne automatiquement les ressources déjà présentes.

## Comptes et apparence

`src/app-icons.ts` met à jour le favicon, apple-touch-icon et le lien du manifeste. L’App initialise les références à partir du compte chargé, remet l’icône par défaut pendant un changement de compte et à la déconnexion. Le mode local non connecté conserve l’icône par défaut. Les aperçus du compte connecté suivent les boutons de couleur ; Annuler rétablit la couleur sauvegardée.

Les anciennes couleurs libres restent dans les préférences et sauvegardes pour préserver la compatibilité. Si un ancien compte en utilise une, l’interface garde cette couleur et l’icône revient à la lavande ; Apparence invite à choisir une des cinq couleurs avant un nouvel enregistrement. Aucune migration automatique ou approximation de couleur n’est appliquée.

Dans Apparence, un lien permet de préparer un nouvel ajout sur iPhone avec la **dernière couleur sauvegardée**. Il ouvre l’entrée HTML statique correspondant à cette couleur. L’information discrète demandée précise qu’un changement peut nécessiter de supprimer puis de réajouter Kalo à l’écran d’accueil.

## Vérifications réalisées

- `npm.cmd test` : 49 tests réussis, dont compatibilité des anciens accents, géométrie inchangée et résolution des URL des manifestes sous GitHub Pages.
- `npm.cmd run build` : réussi ; avertissement Vite déjà présent sur l’import statique/dynamique de persistence.
- `npm.cmd run test:browser` : suite complète réussie, avec le nouveau parcours `tests/app-icons-browser.mjs`.
- Ce parcours vérifie les cinq couleurs, l’absence de champ de couleur libre, les PNG 32/180/192/512 accessibles, leurs dimensions, le fond sombre opaque et la couleur exacte des tracés.
- Aperçu, annulation, sauvegarde, rechargement, changement entre deux comptes simulés, déconnexion et manifeste unique par compte vérifiés dans Chromium.
- Les cinq entrées d’installation ont été vérifiées avec JavaScript désactivé et sous un préfixe `/kalo-compagnon/` reproduit localement.

**Non vérifié :** ajout réel à l’écran d’accueil sur un iPhone/Safari et mise à jour d’une icône déjà installée. Les icônes sont proposées via de vrais PNG et des pages statiques, mais le rafraîchissement d’une icône installée dépend de Safari/iOS ; aucune actualisation automatique n’est promise.

## Fichiers

Modifiés : `src/App.tsx`, `src/Appearance.tsx`, `app.html`, les manifestes racine/public, `package.json`, `scripts/publish-static.mjs`, `tests/appearance-browser.mjs` et les fichiers compilés générés.

Ajoutés : `src/appearance-presets.ts`, `src/app-icon-model.ts`, `src/app-icons.ts`, les scripts `generate-icons.ts` / `check-icons.ts`, les tests `app-icons.test.ts` / `app-icons-browser.mjs`, les répertoires d’icônes, les pages d’installation et ce compte rendu. Aucune nouvelle dépendance, modification distante, commit, push ou publication n’a été effectué pour cette demande.

Références : [Apple — icônes PNG et balises d’application](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html), [WebKit — icônes d’applications web et priorité apple-touch-icon](https://webkit.org/blog/13878/).
