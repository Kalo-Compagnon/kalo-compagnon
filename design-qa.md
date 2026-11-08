# Design QA — Kalo, adaptation du style Campus

final result: passed

Accent global : le choix existant pilote le halo, les boutons, le fond du bilan, la navigation, les pictogrammes et la courbe de poids. Les apports restent rouges et les dépenses vertes dans les cartes, chiffres et graphiques énergétiques. Les chiffres de bilan conservent leurs couleurs sémantiques sur un fond neutre lisible. Les boutons et le fond du bilan utilisent la couleur exacte ; le contraste des textes et les teintes de surface sont dérivés pour le thème clair/sombre. Vérification de neuf couleurs, dont noir, blanc et jaune vif, dans les deux thèmes ; ratio des textes de boutons et accents sur surfaces testées au moins 4,5:1. 39 tests unitaires réussis. Le parcours d’apparence vérifie le changement de couleur du fond du bilan et des boutons, le maintien des chiffres rouges/verts, l’annulation et la persistance. Captures bleues : `qa/kalo-light-mobile.png`, `qa/kalo-dark-mobile.png`.

Métabolisme : âge remplacé par la date de naissance, poids remplacé par la moyenne en lecture seule des sept dernières journées pesées, sans inclure les journées futures. Formulaire vérifié sur mobile : `qa/kalo-basal-birthdate-average.png`. Les 38 tests unitaires passent ; le parcours dédié vérifie correction et suppression d’une pesée puis rechargement, avec mise à jour de la dépense du jour. Les valeurs historiques enregistrées restent conservées.

Budget alimentaire dynamique : dépense estimée moins déficit choisi, puis repas consommés pour le reste à manger. Remplacement de l’objectif fixe dans Repas et le profil ; récapitulatif dans l’accueil. Cas sans métabolisme, repas incomplets et déficit supérieur à la dépense traités explicitement. Vérification de la cohérence Repas/accueil après ajout de 100 kcal d’activité manuelle ; capture `qa/kalo-dynamic-budget-mobile.png`. 34 tests unitaires réussis.

Modification des journées : le clic simple est sans effet. Un appui de 650 ms ouvre les options, puis le bouton « Modifier cette journée » active explicitement la modification. Un mouvement de plus de 10 px ou une annulation du pointeur interrompt le geste. Le clavier ouvre les mêmes options via le bouton natif. Vérification ajoutée au parcours navigateur étendu.

## Mise à jour Kalo et apparence — 4 novembre 2026

- Nom Kalo vérifié dans les deux en-têtes, le titre du navigateur et le manifeste d’installation. Les identifiants internes du stockage restent inchangés pour conserver les données existantes.
- Halo circulaire flouté, non interactif, derrière les écrans. Couleur libre ou préréglée, indépendante du mode Clair / Sombre / Suivre l’appareil. Surfaces avec transparence et flou d’arrière-plan lorsque le navigateur le permet.
- Prévisualisation, annulation, enregistrement, rechargement, préférence système et conservation d’une couleur arbitraire vérifiés dans `tests/appearance-browser.mjs`.
- Vérifications visuelles : `qa/kalo-light-mobile.png`, `qa/kalo-dark-mobile.png`, `qa/kalo-appearance-small.png`, `qa/kalo-dark-*-mobile.png` et `qa/kalo-dark-*-desktop.png`. Mensurations, graphiques, formulaires et import FIT inspectés en sombre. Couleurs et textes des canvas adaptés au thème.
- Aucun débordement horizontal en sombre à 320, 390, 844 et 1440 px ; navigation et interactions principales opérationnelles. L’aperçu du formulaire reste utilisable sur petit écran.
- `npm.cmd test` : 29 tests réussis, incluant validation des préférences, compatibilité des anciens exports et isolation de la couleur par compte.
- `npm.cmd run test:browser` : tous les parcours réussis, dont le nouveau parcours d’apparence.
- Les captures Campus ci-dessous documentent l’étape précédente, avant le renommage Kalo et l’ajout du halo personnalisable.

Vérification du 4 novembre 2026. Périmètre : transposition de la charte graphique de Campus aux fonctions existantes de Logger.

## Références et preuves

- Source : https://lowtaire.github.io/sched/, captures réelles `qa/campus-reference-mobile.png` (viewport 390 × 844) et `qa/campus-reference-desktop.png` (1440 × 1000), DPR 1. Feuille CSS source consultée pour les polices et couleurs.
- Rendu : `qa/logger-campus-mobile.png`, `qa/logger-campus-desktop.png` aux mêmes dimensions CSS et DPR. Les captures complètes dépassent la hauteur du viewport lorsque le contenu défile.
- Comparaisons réunies : `qa/campus-comparison-mobile.png` et `qa/campus-comparison-desktop.png`, source à gauche et Logger à droite, chaque colonne à sa largeur CSS native. Premier viewport avec un bandeau de légende de 40 px.
- Écrans secondaires : `qa/logger-campus-meals-*`, `qa/logger-campus-measurements-*`, `qa/logger-campus-activity-*` aux formats mobile, desktop, paysage, petit mobile et tablette.
- Contrôles supplémentaires : 320 × 740, 768 × 1024, 844 × 390, puis parcours existants à 1920 × 1080 et 2560 × 1440.
- Ancien rapport Android conservé dans `qa/design-qa-android-2026-10-01.md` ; il ne représente pas la référence graphique retenue pour cette évolution.

## Constat et corrections

| Priorité | Surface | Constat | Correction et résultat |
| --- | --- | --- | --- |
| P2 corrigé | Mobile paysage | Le nouvel en-tête plaçait le bouton Ajouter sous la navigation fixe à 844 × 390. | En-tête et espacements compacts en paysage ; contrôle géométrique et parcours navigateur réussis. |
| P2 corrigé | Contrastes | Les anciens champs et étiquettes canvas utilisaient des textes clairs après changement du thème. | Couleurs adaptées dans les feuilles CSS et les deux canvas ; inspection des mensurations et graphiques. |
| P2 corrigé | Identité | Polices Roboto et accents néon de l’ancienne interface. | DM Sans et Manrope hébergées localement, palette Campus appliquée aux composants et à l’icône existante. |

## Comparaison visuelle

| Surface obligatoire | Vérification |
| --- | --- |
| Polices et typographie | DM Sans Variable pour le corps, Manrope Variable pour les titres et valeurs. Polices chargées localement et famille calculée vérifiée. Titres avec chasse resserrée, libellés en petites capitales espacées comme la référence. |
| Espacements et disposition | Marges mobiles 20 px, barre supérieure 78 px ; colonne latérale PC 218 px et barre supérieure 83 px comme Campus. Cartes arrondies 19 px, espaces de 14 à 24 px. Aucun débordement horizontal sur les cinq formats capturés. |
| Couleurs et surfaces | Fond #f6f5f0, surfaces #fff, bordures #e7e7e1, violet #6255bd et carte principale #6153b5. Cartes secondaires lavande, vert sauge et pêche. Textes secondaires légèrement renforcés pour la lecture. |
| Images et assets | Campus ne requiert aucune photographie à transférer. Illustrations anatomiques Android conservées sans déformation ; étiquettes adaptées en lavande. Icône existante recolorée, sans nouveau dessin. |
| Contenu | Termes et actions de Logger conservés. Les cours et l’université de Campus ne sont pas recopiés dans le produit. Identité affichée : logger. |
| Navigation et états | Navigation latérale PC et inférieure mobile, état actif violet, focus visible. Connexion, formulaire de profil, modales, champs et actions principales fonctionnels. |

Les vues réunies permettent de comparer directement les polices, la barre supérieure, les marges, les surfaces et les cartes. Les captures secondaires montrent aussi les étiquettes anatomiques et champs à une taille lisible.

## Écarts intentionnels et limites

- Les blocs suivent les besoins de Logger : bilan, statistiques, poids et historique. Le calendrier de Campus n’est pas ajouté.
- Pictogrammes existants conservés ; leur style plein diffère des icônes de contour de Campus. Écart P3 accepté pour conserver les ressources de l’application.
- Les fonds pastel et le violet sont repris ; les lignes décoratives de la carte Campus ne sont pas nécessaires aux données de Logger.
- Vérifications avec Chromium dans des contextes isolés. Safari sur iPhone réel et connexion à deux comptes Supabase réels non vérifiés ici.
- Ancienne comparaison Android automatisée ignorée par le test existant car `screen-global.png` est absent ; comparaison Campus effectuée séparément et décrite ci-dessus.

## Validation fonctionnelle

- `npm.cmd test` : 27 tests réussis.
- `npm.cmd run build` : TypeScript et compilation réussis.
- `npm.cmd run test:browser` : parcours principaux, étendus et profil mobile réussis.
- Tests de disposition supplémentaires : aucune largeur dépassée, bouton Ajouter accessible en paysage.
- Aucun compte réel créé et aucune publication distante effectuée.

## Sélecteur alimentaire compact — 8 novembre 2026

Référence : capture fournie dans la conversation (798 × 450), utilisée pour l’organisation des éléments, conformément au brief qui impose de conserver la charte Kalo. Comparaison visuelle avec `qa/food-picker-mobile.png` et `qa/food-picker-dark.png` à 390 × 844. Il s’agit d’une adaptation mobile dans la feuille existante, pas d’une copie de la palette noire ni d’une comparaison pixel à pixel. Les aliments affichés diffèrent : aucune valeur illustrative de la référence n’est injectée dans le catalogue.

Corrections après le premier rendu : suppression du grand bouton de recherche OFF au profit de la loupe, champ arrondi de 42 px, filtres de 28 px, navigation secondaire de 28 px et lignes séparées par une bordure fine. Libellé « Aliments bruts » repris de la référence. Création personnelle conservée sous forme de commande discrète ; favoris et modification personnelle restent fonctionnels.

Surfaces vérifiées :
- Typographie : polices Kalo conservées, hiérarchie titre / nom / source lisible, noms longs sur plusieurs lignes.
- Espacements : densité de la référence reprise, absence de grandes cartes, aucune largeur dépassée à 320/390/768/1440 px.
- Couleurs : variables de thème et accent personnalisé conservés, captures en clair et en sombre avec accent rose.
- Ressources : aucune image décorative nécessaire ; icônes de la bibliothèque existante, aucun faux scanner.
- Contenu : titre, recherche, filtres, Récents/Favoris/Catalogue et ajout présents ; états vides et indisponibilité Ciqual explicites.

Validation : `npm.cmd run build`, `npm.cmd test` (64 tests) et `node tests/food-picker-browser.mjs` réussis après la correction visuelle. Le test navigateur vérifie aussi les hauteurs compactes, les favoris, l’ajout au journal, l’erreur OFF simulée et les quatre formats. La suite navigateur complète avait réussi avant cette correction CSS ; le test ciblé du sélecteur a été réexécuté ensuite.

Écarts intentionnels : palette, police, feuille modale et navigation de Kalo conservées ; étoile de favoris ajoutée à côté de l’action d’ajout pour garder cette fonction accessible. Vérification Safari/iPhone physique et API OFF réelle non effectuée.

final result: passed (organisation compacte et adaptation à la charte Kalo)

## Intégration visible dans Repas — 8 novembre 2026

Le sélecteur compact est désormais affiché directement sous le budget calorique dans Meals.tsx, et non seulement derrière « Ajouter / Aliment ». La capture qa/food-picker-inline-desktop.png montre la page à 1544 × 820 (capture pleine page, contenu plus haut que la fenêtre), comparée à la capture utilisateur du même écran avant changement. Le choix d'un aliment ouvre la quantité existante, avec retour vers Repas. La commande secondaire conserve les repas et extras. Les thèmes Kalo et la navigation mobile sont préservés.

Le test food-picker-browser.mjs exerce désormais l'entrée directe depuis Repas. Build et test ciblé réussis. Les tests historiques ont été ajustés pour distinguer le sélecteur intégré de celui qui sert encore à la composition de repas dans une fenêtre.

final result: passed (sélecteur visible directement dans la page Repas)
