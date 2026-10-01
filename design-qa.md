# Design QA — conversion React

final result: blocked

## Preuves examinées le 1 octobre 2026

- Source visuelle : `../screen-global.png`, 1080 × 2400 pixels. Ancien Global du 13 septembre, assombri, avec sélecteurs Jour/Semaine/14 jours. La capture `screen-global-integrated.png` est noire.
- Source actuelle : layouts XML et Kotlin inventoriés dans ANDROID_ANALYSIS.md. Global utilise désormais une moyenne glissante et un objectif cumulé.
- Rendu : `qa/verified-Global-390x844.png`, page complète au viewport 390 × 844, DPR 1. Données de test : entrées du jour et journée historique, moyenne d'une journée complète.
- Comparaison réunie : [qa/comparison-global.png](qa/comparison-global.png). Source ramenée uniformément à 390 pixels de large (facteur 390/1080), web à sa taille CSS. Barres système Android conservées dans la référence, sans imitation dans le web. Densité Android d'origine inconnue : ce rapprochement ne mesure pas la parité au pixel.
- Écrans secondaires : `qa/verified-Repas-*`, `qa/verified-Mensuration-*`, `qa/verified-Activité-*`. Détail et vue secrète également capturés.
- Formats : 390 × 844 portrait, 844 × 390 paysage, 1920 × 1080 PC et 2560 × 1440. Contextes tactiles mobiles et contextes PC distincts, animations terminées avant capture.

## Comparaison

La source et le rendu ne représentent ni la même version ni les mêmes données. Leur comparaison confirme la structure générale (titre, bilan, deux cartes, graphique, navigation), sans certifier la fidélité demandée sur tous les écrans. Aucun score de similitude n'est annoncé.

| Surface | Observation et limite |
|---|---|
| Typographie | Roboto embarquée, hiérarchie et graisses cohérentes avec la référence ; tailles reprises des XML actuels. Titre, cartes et navigation lisibles. Métriques et retours de ligne exacts à comparer avec une référence actuelle. |
| Espacements | Marges mobiles de 18 px, cartes arrondies et navigation flottante conservées. Le bilan actuel est plus haut que l'ancien, avec des textes supplémentaires du Kotlin actuel. Global passe en deux colonnes sur PC. Aucun débordement horizontal sur les quatre écrans et quatre formats. |
| Couleurs | Valeurs Android, dont fond #0B0D12 et accents bleu/rose/jaune/vert. L'ancienne capture est assombrie ; ses pixels ne remplacent pas les couleurs du source. |
| Images | PNG originaux, chemins vectoriels Android, Canvas porté du dessin natif. Silhouette nette et non déformée dans le rendu examiné. Référence actuelle manquante pour vérifier précisément rubans et étiquettes. |
| Textes | Textes du code actuel, notamment moyenne glissante et objectif. Différences connues avec la capture ancienne. Références manquantes pour les autres écrans. |

Une comparaison focalisée au pixel donnerait une précision trompeuse avec ces états et densités différents. Il faut des captures Android actuelles au même état pour la réaliser.

## Corrections et vérification après correction

1. Nom accessible de Mensuration : exclusion du texte décoratif « cm » du nom accessible, sans modification visuelle. Navigation testée après correction.
2. Incréments rapides : utilisation de la dernière valeur dans la transaction pour ne pas perdre une pression rapprochée. Test de double pression passé.
3. Sélection directe sur le corps : mêmes seuils de coordonnées que Kotlin, en plus des étiquettes et du balayage. Compilation et parcours des vues vérifiés ; gestes réels sur iPhone à confirmer.
4. Captures intermédiaires pendant la transition de couleur : remplacées comme preuves principales par les captures `verified-*`, après contrôle de l'onglet actif et terminaison des animations.

5. [P2 corrigé] Repas en paysage : le bouton Ajouter chevauchait la navigation flottante. Réduction uniquement en paysage du remplissage de la carte et de la hauteur du bouton. La nouvelle capture qa/verified-Repas-844x390.png montre le bouton dégagé ; contrôle géométrique et clic navigateur réussis après correction.

6. Navigation rapprochée du source actuel : remplissage de 8 px, icône « cm » de 13 px, espacement icône/texte nul, fond actif opaque #202532 et contour #343A48. Dégradés issus de LiquidGlassLayout ; flou retiré car absent du dessin Android. Compilation et parcours navigateur aux quatre formats réussis après ces corrections.

Comparaison post-correction : qa/comparison-global.png. Aucun changement graphique n'a été justifié à partir de la capture ancienne seule.

## Tests navigateur

Playwright/Chromium autorisé explicitement. Profils isolés sans données personnelles. Résultats : qa/browser-results.json et qa/extended-results.json.

Réussis : basal ; aliment personnalisé avec calcul attendu ; extra sans calories puis modification ; pas ; mensurations et double incrément ; repas à quantité variable ; photo ; téléchargements JSON/CSV ; suppression puis restauration JSON avec photo ; assistant historique ; progression poids/taille ; édition d'une journée passée ; rechargement ; navigation et absence de débordement aux quatre formats. Aucune exception JavaScript pageerror détectée.

Ces tests ne remplacent ni Safari/iPhone réel ni Supabase réel.

## Contrôles ouverts

1. Captures Android actuelles des écrans et dialogues au même état. Aucune référence exploitable pour les trois autres écrans, aucun émulateur configuré ou appareil connecté disponible.
2. Safari sur iPhone : clavier, caméra, fichiers, gestes, rotation, installation.
3. Supabase configuré : authentification, RLS et synchronisation réelle entre appareils ; tests actuels avec serveur simulé.

Le statut blocked porte sur l'acceptation de la fidélité visuelle complète. Compilation et parcours ci-dessus passent. La conversion n'est pas déclarée identique à Android ou prête pour production.
