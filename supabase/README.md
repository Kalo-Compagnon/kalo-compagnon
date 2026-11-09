# Schéma public, configuration privée

Les migrations définissent les tables, fonctions et politiques d’accès. Elles ne contiennent ni comptes réels, ni mots de passe, ni clés d’administration.

La paire autorisée est enregistrée par l’administrateur dans Supabase. Cette configuration reste dans la base ; elle n’est pas téléchargée par le frontend et ne doit pas être ajoutée au dépôt. Exécuter une migration générique ne modifie pas une paire déjà configurée.

Les scripts d’installation propres à l’environnement sont conservés localement dans `local-only/`, exclu de Git. Ils ne sont pas nécessaires au build. Une fois la paire configurée, les deux comptes activent leur Duo et choisissent leurs autorisations indépendamment.

Les tests utilisent des identifiants fictifs et une base PostgreSQL locale via PGlite. Aucun accès à un projet Supabase réel n’est nécessaire pour les lancer.

## Catalogue Kalo commun

Pour les suppressions par glissement, appliquer [20261109150000_food_soft_delete.sql](migrations/20261109150000_food_soft_delete.sql) apres les migrations ci-dessous. Les fiches sont archivees, sans suppression physique, pour conserver les anciens repas.

La migration [20261109140000_food_unit_weight.sql](migrations/20261109140000_food_unit_weight.sql), a executer apres les deux migrations ci-dessous, ajoute le poids facultatif d'une unite aux fiches partagees. Les anciennes fiches par piece sans poids restent compatibles.

Pour les variantes de gout, executer aussi [20261109130000_food_subtype.sql](migrations/20261109130000_food_subtype.sql) apres la migration ci-dessous. Le champ est facultatif et compatible avec les fiches existantes.

Exécuter [20261109120000_shared_food_catalog.sql](migrations/20261109120000_shared_food_catalog.sql) dans le SQL Editor du projet existant. Ce script est réexécutable ; il crée uniquement le catalogue alimentaire commun et reprend les aliments créés par les utilisateurs. Il ne change pas les règles d’accès des documents privés. Ne pas réexécuter `schema.sql`.

Tous les comptes authentifiés lisent et modifient les fiches Kalo, via une fonction avec contrôle de révision. Les favoris, dates d’utilisation, recettes et entrées du journal ne sont pas partagés. Le client vérifie les changements toutes les 15 secondes, à la connexion, au retour en ligne et au retour au premier plan. Les ajouts hors ligne sont envoyés à la reconnexion.
