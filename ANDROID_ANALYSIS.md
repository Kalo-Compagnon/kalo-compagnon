# Inventaire Android avant conversion

Référence : `app/src/main`, examinée le 1 octobre 2026. Le prototype HTML antérieur est conservé dans `legacy-prototype/` ; il contenait des valeurs fixes et ne constitue pas la référence fonctionnelle. Aucun fichier Android n'est modifié.

## Navigation et écrans

`MainActivity` ouvre Global, Repas (`TodayFragment`), Mensuration (`MeasurementsFragment`), Activité. Global ouvre Export. Un appui long sur une journée passée active une date partagée par les quatre onglets, avec cadre jaune, bandeau et bouton Terminer. La date courante est vérifiée toutes les 30 secondes.

Global : moyenne glissante, objectif de déficit modifiable 1–3000, calculateur basal, graphique empilé normalisé, jours incomplets, historique éditable et export.
Repas : objectif calorique propre à chaque jour, calories tronquées à l'entier, restant/dépassement, déficit théorique, chronologie, modification et suppression. Ajouter ouvre FoodHub : repas enregistrés (favoris/fréquents/récents), recherche d'aliments sans accents par catégorie (40 résultats), quantité g/ml avec macros, aliment personnalisé, composition multi-ingrédients et quantités variables, extra avec photo/caméra et calories facultatives.
Mensurations : vue globale, haut/centre/bas du corps, glissement, sélection sur silhouette, incrément de 0,5 cm, sauvegarde par date. 8 zones : Épaules, Poitrine, Bras, Taille, Ventre, Hanches, Cuisse, Mollet. Historique : toutes les zones > 0, pas de doublon consécutif, maximum 30 relevés, aperçu des 5 derniers et différences. Titre du dernier groupe : mesure secrète Longueur/Circonférence.
Activité : pas manuels supplémentaires, historique horizontal, import FIT et dédoublonnage SHA-256 + empreinte d'activité, aperçu des 5 derniers imports (20 conservés).
Export : CSV séparateur point-virgule, champs entre guillemets, journées/entrées/relevés/repas/ingrédients/aliments/imports FIT.

Code historique non accessible depuis la navigation actuelle : ProgressFragment (poids/taille/photo), HistoryFragment, AddEntrySheet (repas simple), MealWizardSheet (assistant de 9 familles), DishConfigSheet/MealConfigStore (catalogue prédéfini), SimplePageFragment. Le port doit signaler leur statut au lieu de prétendre qu'ils sont des écrans actifs. Les relevés physiques et repas anciens doivent être préservés à l'import/export.

## Données

Room v4 : LogEntry (id, timestamp, type, note, imagePath, tags, nom, quantité/unité, kcal, P/G/L), Food (nom normalisé, catégorie, quatre valeurs/100, unité, favori, compteur, dernière utilisation, personnalisé), Meal (nom, favoris/usage, photo, notes, totaux en cache), MealIngredient (mealId, foodId, quantité, variable, position), SavedMeal ancien, PhysicalRecord (timestamp, taille, poids, photo).
SharedPreferences : nutrition/daily_target ; daily_activity (profil basal, pas supplémentaires par jour, pas FIT, kcal FIT, pas couverts) ; journal_days (premier jour, début, basal/cible historiques) ; global_display/deficit_goal_kcal ; measurements par jour et historique ; activity_fit (imports et empreintes) ; meal_configuration (taux/quantités historiques).

## Formules exactes

- Kotlin Float : arrondir en IEEE754 float32 à chaque opération Float, pas uniquement à l'affichage. Les `sumOf { toDouble() }` s'accumulent en double puis sont convertis selon le site appelant.
- Basal = 10f × poids + 6,25f × taille − 5f × âge + (homme : 5f ; femme : −161f). Validation : âge entier 13–120, taille 100–250, poids 30–350. Pas de basal inventé.
- Pas = 300 + max(0, pas manuels) + max(0, pas importés). Anciennes valeurs manuelles Android migrées par soustraction de 300.
- Activité = max(0, pas − pas couverts FIT) × 0,045f + max(0, kcal FIT). Le champ historique sport_ n'est PAS ajouté à la dépense dans le code actuel.
- Dépense = basal + activité ; net = apport − dépense ; déficit = −net.
- Global : 7 dates inclusives finissant au jour actif. Jour valide seulement si au moins une entrée, aucune calorie null et basal > 0. Moyennes sur les jours valides uniquement, pas sur 7 par défaut. Cumul = déficit moyen × nombre valide ; objectif cumulé = objectif × 7. Aucun valide : tirets.
- Repas : consommé = troncature de la somme double. Déficit théorique = troncature(dépense) − consommé. Barre bornée 0–100.
- Aliment : facteur = quantité / 100f ; valeurs = taux × facteur. Composition : cumul Float32 dans l'ordre des ingrédients. Repas sans ingrédients : totaux en cache.
- Ancien catalogue : somme double des sous-totaux Float32 quantité × taux / (pièce ? 1 : 100), puis troncature entière.
- Graphique : barre totale apport+dépense normalisée à 100 %, apport en bas, dépense en haut, repère 50 %, astérisque si incomplet. Largeur minimale 120 × jours + 24.
- FIT : priorité aux sessions ; pas explicites pour walking/running/hiking seulement ; estimation de pas couverts via cadence (une/deux jambes selon distance/pas proche de 1 m), sinon distance/0,95 ; calories de session sans soustraction du basal. Groupement par jour avant empreinte. Monitoring Android dépend du MonitoringReader Garmin Java (expansion des compteurs compressés, agrégation quotidienne).

## Visuel et ressources

Layouts XML + vues programmatiques prioritaires (captures de septembre antérieures à la moyenne glissante actuelle). Fond #0B0D12, cartes #171A22, bordures #272B36, texte #F7F8FA, secondaire #9AA1AE. Accents #2F6BFF / #FF2D70 / #FFD54F / #41D17D. Marges horizontales 18dp, cartes rayon 18dp, navigation basse 76dp, titres 28/30sp. Police système Android Roboto. Composants : cartes, champs sombres, boutons pleins, feuilles modales, lignes avec actions par appui long, barre LiquidGlass, canvas de graphique et de silhouette.

Réutiliser foods_seed.json intégralement, body_measurement_simple.png et measurement_secret_anatomy.png ; convertir les paths vectoriels ic_home/ic_meat/ic_other sans modifier leur dessin. MeasurementBodyView place des rubans derrière/devant le PNG et des étiquettes cliquables.

## Architecture web

React/TypeScript/Vite, domaine indépendant testé ; IndexedDB pour les données et photos ; Supabase Auth + table protégée par RLS, synchronisation par enregistrements avec révisions et conflits explicites. Le stockage local reste disponible sans configuration distante ; ce mode n'est pas une synchronisation entre appareils. JSON complet de sauvegarde et CSV compatible Android. Ne pas reconstruire des photos depuis des chemins content:// : demander de joindre les fichiers originaux. Le CSV Android n'exporte pas les mensurations SharedPreferences, les réglages complets ni les empreintes FIT ; ces données ne peuvent pas être récupérées depuis ce CSV seul.
