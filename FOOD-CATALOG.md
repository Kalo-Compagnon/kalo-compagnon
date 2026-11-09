# Catalogue alimentaire

Le catalogue Kalo contient uniquement les aliments ajoutes par les utilisateurs (isCustom, sans source externe). Les aliments predefinis restent archives pour les recettes et l'historique, mais ne sont proposes ni dans le catalogue ni dans les recherches, favoris ou recents. Les definitions des aliments sont communes a tous les comptes connectes ; favoris, recents, usages, repas et journal restent prives.

## Catalogue partage

Appliquer aussi `supabase/migrations/20261109130000_food_subtype.sql` apres la migration du catalogue pour conserver les variantes dans les fiches partagees. Les anciennes fiches sans variante restent compatibles.

Appliquer aussi `supabase/migrations/20261109130000_food_subtype.sql` apres la migration du catalogue pour conserver les variantes dans les fiches partagees. Les anciennes fiches sans variante restent compatibles.

Appliquer `supabase/migrations/20261109120000_shared_food_catalog.sql` dans le SQL Editor Supabase. Ne pas reexecuter `schema.sql` sur le projet existant. La migration cree `logger_food_catalog` et la fonction `logger_catalog_put`, avec lecture authentifiee et ecritures controlees par revision. Elle reprend les creations deja synchronisees, uniquement avec les champs du catalogue. Les autres documents et les regles privees restent inchanges.

Les creations et modifications sont publiees lors de la synchronisation, puis lues par tous les comptes : connexion, retour de reseau, retour au premier plan et verification toutes les 15 secondes. Les ajouts locaux restent en attente sans connexion ; le transfert local vers un compte garde le parcours existant. Une creation en mode invite n'est pas publiee sans transfert vers un compte connecte.

Chaque compte peut modifier les definitions du catalogue commun. Deux modifications simultanees du meme aliment declenchent un conflit resoluble dans Synchronisation. Les favoris et compteurs personnels ne sont jamais inclus dans les valeurs communes. La suppression d'une copie privee n'efface pas un aliment du catalogue commun. Les entrees historiques gardent leurs calories deja enregistrees.

Tests : `tests/shared-food-sql.test.ts`, `tests/shared-food-sync.test.ts`, `tests/shared-food-browser.mjs` (deux navigateurs authentifies et vrai PostgreSQL local). La migration distante ne fait pas partie du build : elle doit etre appliquee sur Supabase pour activer le partage.

Le selecteur propose Tous, Aliments bruts (Ciqual) et Catalogue Kalo. Recherche locale par nom, marque, alias et identifiant. Quatre lignes visibles puis defilement vertical. Glisser une fiche personnelle vers la gauche ouvre la modification. Au clavier : fleche gauche depuis un bouton de la fiche.

Les anciennes fiches externes restent archivees pour les recettes et le journal, hors du selecteur. Le client externe, son cache et son convertisseur sont supprimes.

Le bouton Creer est place a droite de la recherche. Le formulaire distingue Nom, Marque et Variante / gout (facultatif, champ subtype). La variante apparait dans les resultats, le calculateur et les entrees du journal ; elle est recherchable et conservee dans les sauvegardes.

## Ciqual

Le bouton Creer est place a droite de la recherche. Le formulaire distingue Nom, Marque et Variante / gout (facultatif, champ subtype). La variante apparait dans les resultats, le calculateur et les entrees du journal ; elle est recherchable et conservee dans les sauvegardes.

Les produits bruts seront ajoutes plus tard par l'utilisateur depuis Ciqual. src/ciqual-data.json reste vide en attendant cet import. Aucun aliment predefini n'est reetiquete Kalo ou Ciqual. Le filtre affiche un message quand les donnees manquent.

Installer les donnees officielles avec npm run prepare:ciqual -- fichier.csv 2025 puis reconstruire. Le CSV UTF-8 utilise les en-tetes officiels ANSES et le separateur point-virgule. Les valeurs manquantes et la version sont conservees.

Source : https://ciqual.anses.fr/ ; DOI 10.57745/RDMHWY.

Les bases de calcul sont 100 g/ml ou 1 unite. Les sauvegardes et calories historiques restent compatibles.

Pour les nouvelles fiches a la piece, les valeurs du paquet restent saisies pour 100 g et `unitWeightGrams` indique le poids d'une piece. Le calcul utilise quantite en pieces × poids / 100. Exemple : 500 kcal/100 g, barre de 21 g = 105 kcal pour 1 unite. Les anciennes fiches sans poids restent calculees par piece ; renseigner leur poids dans le formulaire convertit leurs valeurs existantes vers une base de 100 g. Les entrees deja enregistrees restent inchangees.

Appliquer `supabase/migrations/20261109140000_food_unit_weight.sql` apres les migrations precedentes pour synchroniser le poids d'une unite. Les exports JSON/CSV conservent ce poids et la base nutritionnelle.

Pour les nouvelles fiches a la piece, les valeurs du paquet restent saisies pour 100 g et `unitWeightGrams` indique le poids d'une piece. Le calcul utilise quantite en pieces × poids / 100. Exemple : 500 kcal/100 g, barre de 21 g = 105 kcal pour 1 unite. Les anciennes fiches sans poids restent calculees par piece ; renseigner leur poids dans le formulaire convertit leurs valeurs existantes vers une base de 100 g. Les entrees deja enregistrees restent inchangees.

Appliquer `supabase/migrations/20261109140000_food_unit_weight.sql` apres les migrations precedentes pour synchroniser le poids d'une unite. Les exports JSON/CSV conservent ce poids et la base nutritionnelle.

## Calculateur de repas

La troisieme action de chaque aliment (assiette et couverts) ajoute une portion au calculateur sous la liste. Le brouillon reste en memoire, avec des quantites modifiables, le retrait de chaque portion et le total des kcal en direct. Le bouton general d'ajout de repas ou d'extra a ete retire.

Seule la validation « Ajouter ce repas a la journee » cree une entree de repas dans le journal. Le nom est facultatif. Les aliments, leurs usages et les calories sont enregistres dans la meme transaction ; le brouillon est vide apres reussite et conserve en cas d'erreur. Vider le brouillon ne change pas le journal.
