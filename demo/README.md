# Données fictives Kalo

`kalo-demo.json` contient un profil de démonstration, 28 journées du 9 octobre au 5 novembre 2026, 112 entrées alimentaires, 15 pesées, cinq relevés de mensurations, dix activités FIT simulées, quatre aliments et une recette favorite. Aucune donnée n’est issue d’une personne réelle.

Pour charger ce jeu dans le compte test :

1. Se connecter au compte test dans Kalo.
2. Accueil → Exporter toutes mes données (.csv), qui ouvre la page Données.
3. Choisir un fichier JSON ou CSV → sélectionner `demo/kalo-demo.json`.
4. Importer après vérification → Confirmer.

L’import renseigne aussi le profil et ses préférences. Les autres enregistrements restent présents ; les identifiants `demo-*` sont réservés aux données fictives. Utiliser ce fichier uniquement dans le compte de test.

Le fichier a été validé par l’importeur et importé dans un navigateur isolé pour contrôler le rendu des écrans. Après correction de l’adresse du compte test, les données ont été ajoutées dans Supabase le 5 novembre 2026 via `logger_put`, avec les droits du compte test : 28 journées, 112 entrées alimentaires, dix activités FIT simulées, quatre aliments, une recette, 40 valeurs de mensurations et cinq relevés physiques vérifiés par relecture. Les 13 réglages préexistants ont été conservés ; la journée existante a reçu uniquement les champs manquants. Aucun autre compte ni paramètre de partage Duo n’a été modifié.

Pour régénérer le jeu localement avec une autre date de fin :

```powershell
npx.cmd tsx scripts/create-demo.ts 2026-11-05
```

Le générateur n’utilise aucun identifiant et n’écrit jamais dans Supabase.

## Duo fictif en lecture seule

La vue a été allégée : les paragraphes explicatifs, légendes textuelles répétitives, détails de période, bilan cumulé et notes de budget ont été retirés du Duo. Les titres, principaux indicateurs, objectifs, dates, noms, mention de données fictives et états importants (données manquantes ou non partagées) restent présents. Les hachures et repères du graphique sont conservés. L’Accueil personnel n’est pas modifié par cette simplification.

Couleurs actuelles du graphique commun : dépense dans l’accent du profil, apport dans une variante foncée avec des hachures diagonales légèrement plus claires. Les deux nuances et les hachures se recalculent à partir de chaque accent. Ce choix remplace la complémentaire précédente.

Le padding intérieur est réduit dans Duo uniquement : 12 px dans les cartes de contenu et de pas, 16 px dans le bilan, 12 px dans les statistiques et 8 × 12 px dans leurs bandes quotidiennes. Les sections et les deux colonnes gardent 18 px d’écart extérieur ; les espacements internes entre cartes statistiques restent inchangés.

Dernière simplification : les pas sont affichés dans deux cartes séparées, une par profil dans son accent, juste sous les synthèses d’Accueil. Les blocs courbes de poids et Mensurations ont été retirés de la vue Duo, ainsi que les graphiques et détails d’activité. Les données personnelles, les autorisations et les calculs de dépense dans la synthèse de l’Accueil restent inchangés.

Les deux cartes de pas utilisent l’accent sur tout leur fond et une couleur de texte adaptée au contraste. Le graphique commun regroupe deux barres par journée, Coralie à gauche et Loric à droite. La dépense utilise l’accent exact du profil et l’apport une variante foncée hachurée. Les hauteurs sont désormais exprimées sur une échelle absolue commune en kcal : chaque barre représente la somme apport + dépense ; la partie foncée représente l’apport et la partie d’accent la dépense. Le maximum commun est calculé sur toutes les journées disponibles et autorisées de la période. Deux lignes à 30 % d’opacité indiquent chacune la moitié du maximum personnel sur cette période. Une série absente ou non autorisée n’ajoute ni barre ni repère. Les calculs de calories et le graphique de l’Accueil personnel restent inchangés.

La vue Duo est organisée en deux moitiés égales, Coralie à gauche et Loric à droite, y compris sur mobile. Un sélecteur de journée consulte la même date pour les deux sans modifier les données. Aucune valeur n’est créée pour une date manquante ; les objectifs restent individuels, sans classement. La même présentation s’applique au Duo réel, avec les autorisations serveur inchangées.

Les deux colonnes reprennent désormais directement la synthèse de l’Accueil (`Global` en lecture seule) : bilan sur sept jours, objectif, apport moyen et du jour, dépense moyenne et du jour, budget alimentaire et graphique apport/dépense. Chaque colonne reçoit localement la palette d’accent de son profil, sans changer l’accent du compte connecté. Les couleurs sémantiques d’alimentation et de dépense restent celles de l’Accueil. Les graphiques communs sont conservés sous les deux synthèses. Aucune commande de saisie, de réglage ou d’export n’apparaît dans ces synthèses.

Dans le bilan calorique, les textes utilisent des variantes plus foncées de l’accent du profil, adaptées au fond pour conserver un contraste de 4,5:1. Dans Duo uniquement, le montant est limité à 24 px et réduit davantage si nécessaire pour garder le nombre et « kcal » sur une seule ligne. L’Accueil personnel conserve sa taille de police d’origine, ainsi que les nouvelles couleurs.

La préférence `settings/duoDemo=true` a été activée sur le compte test uniquement. L’onglet Duo affiche alors les deux profils fictifs « Coralie » et « Loric », avec un bandeau de démonstration et sans commandes de liaison, de partage ou de modification. Les réglages du compte présentent également cet état en lecture seule. Aucun compte de partenaire n’est nécessaire et aucune requête à `logger_duo` n’est effectuée dans ce mode.

Le fichier `duo-demo.json` contient exclusivement des données générées, indépendantes des vrais comptes et du journal personnel du compte test. Les accents rose et bleu utilisent deux couleurs de la palette existante. Les données sont incluses dans le build local ; il faut ouvrir cette version de l’app pour voir la démonstration. Aucun déploiement n’a été effectué.

Pour régénérer les deux profils fictifs : `npx.cmd tsx scripts/create-duo-demo.ts`. Pour rendre au compte test le fonctionnement Duo normal, remplacer uniquement sa préférence `settings/duoDemo` par `false`. Cela ne modifie aucune liaison réelle.

Vérifications : build, tests unitaires, parcours Duo réel simulé et parcours dédié `tests/duo-demo-browser.mjs` (lecture seule, absence d’accès au vrai Duo, isolation du journal, halo, modes clair/sombre et largeurs 320, 390, 768, 844 et 1440).
