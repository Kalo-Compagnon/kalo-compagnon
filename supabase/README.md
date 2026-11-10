# Schéma public, configuration privée

Les migrations définissent les tables, fonctions et politiques d’accès. Elles ne contiennent ni comptes réels, ni mots de passe, ni clés d’administration.

La paire autorisée est enregistrée par l’administrateur dans Supabase. Cette configuration reste dans la base ; elle n’est pas téléchargée par le frontend et ne doit pas être ajoutée au dépôt. Exécuter une migration générique ne modifie pas une paire déjà configurée.

Les scripts d’installation propres à l’environnement sont conservés localement dans `local-only/`, exclu de Git. Ils ne sont pas nécessaires au build. Une fois la paire configurée, les deux comptes activent leur Duo et choisissent leurs autorisations indépendamment.

Les tests utilisent des identifiants fictifs et une base PostgreSQL locale via PGlite. Aucun accès à un projet Supabase réel n’est nécessaire pour les lancer.

## Catalogue Kalo commun

Activation distante effectuee le 10 novembre 2026 sur `rlatjredsjvgjsbrqmtm`, migration `shared_food_catalog_current` : 38 fiches existantes reprises, aucune fiche manquante et aucun champ prive detecte dans le catalogue. Le script exact est [shared-catalog-activation.sql](shared-catalog-activation.sql). Il utilise le validateur le plus recent avant la reprise initiale pour conserver variantes, poids unitaire, archivage et cuisson. Ne pas rejouer les anciennes migrations de validateur seules, ce qui retirerait la prise en charge des champs plus recents.

Lecture commune a tous les comptes connectes sous RLS, ecriture uniquement via la RPC avec controle de revision. Aucun acces anonyme. Favoris, recettes, consommations et journaux restent prives. Les tests SQL et de synchronisation entre comptes passent ; la verification visuelle avec deux sessions reelles reste a faire apres rafraichissement de l'application.

Pour les types de cuisson (pâtes sèches, riz sec), appliquer [20261110180000_food_cooking_type.sql](migrations/20261110180000_food_cooking_type.sql) après les migrations ci-dessous. Cette migration conserve le type dans le catalogue partagé. Les suivis de portions et les consommations restent des documents privés.

Pour les suppressions par glissement, appliquer [20261109150000_food_soft_delete.sql](migrations/20261109150000_food_soft_delete.sql) apres les migrations ci-dessous. Les fiches sont archivees, sans suppression physique, pour conserver les anciens repas.

La migration [20261109140000_food_unit_weight.sql](migrations/20261109140000_food_unit_weight.sql), a executer apres les deux migrations ci-dessous, ajoute le poids facultatif d'une unite aux fiches partagees. Les anciennes fiches par piece sans poids restent compatibles.

Pour les variantes de gout, executer aussi [20261109130000_food_subtype.sql](migrations/20261109130000_food_subtype.sql) apres la migration ci-dessous. Le champ est facultatif et compatible avec les fiches existantes.

Exécuter [20261109120000_shared_food_catalog.sql](migrations/20261109120000_shared_food_catalog.sql) dans le SQL Editor du projet existant. Ce script est réexécutable ; il crée uniquement le catalogue alimentaire commun et reprend les aliments créés par les utilisateurs. Il ne change pas les règles d’accès des documents privés. Ne pas réexécuter `schema.sql`.

Tous les comptes authentifiés lisent et modifient les fiches Kalo, via une fonction avec contrôle de révision. Les favoris, dates d’utilisation et entrées du journal ne sont pas partagés. Le client vérifie les changements toutes les 15 secondes, à la connexion, au retour en ligne et au retour au premier plan. Les ajouts hors ligne sont envoyés à la reconnexion.

## Recettes communes

La migration [20261110180622_shared_meal_catalog.sql](migrations/20261110180622_shared_meal_catalog.sql) a ete appliquee sur le projet existant le 10 novembre 2026. Les trois recettes existantes ont ete reprises dans `logger_meal_catalog` ; aucune recette manquante et aucun champ personnel dans les definitions communes lors du controle distant.

Les comptes connectes partagent nom, ingredients, quantites et valeurs nutritionnelles des recettes. Les definitions alimentaires necessaires sont incluses avec une liste stricte de champs afin qu'un autre compte puisse preparer une recette utilisant un aliment Ciqual qu'il n'a jamais consulte. Les favoris, utilisations, notes, photos et dates personnelles restent prives. Les plats en suivi de portions conservent leurs ingredients et leur historique prives : une modification ou suppression commune ne reecrit pas les anciennes assiettes.

RLS active ; lecture pour `authenticated`, aucun acces `anon`, ecriture uniquement par `logger_meal_catalog_put` avec authentification, validation et controle de revision. Les suppressions utilisent des marqueurs conserves pour eviter une republication par un appareil hors ligne. Les conflits passent par l'ecran Synchronisation existant. Les ajouts et modifications sont synchronises par le frontend actualise ; aucune publication GitHub Pages n'a ete effectuee dans cette intervention.

L'avis Supabase relatif a la RPC `SECURITY DEFINER` accessible aux comptes connectes est attendu : elle constitue l'unique point d'ecriture autorise, avec `auth.uid()`, chemin de recherche vide et droits directs retires. Reference : https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
