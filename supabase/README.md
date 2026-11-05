# Schéma public, configuration privée

Les migrations définissent les tables, fonctions et politiques d’accès. Elles ne contiennent ni comptes réels, ni mots de passe, ni clés d’administration.

La paire autorisée est enregistrée par l’administrateur dans Supabase. Cette configuration reste dans la base ; elle n’est pas téléchargée par le frontend et ne doit pas être ajoutée au dépôt. Exécuter une migration générique ne modifie pas une paire déjà configurée.

Les scripts d’installation propres à l’environnement sont conservés localement dans `local-only/`, exclu de Git. Ils ne sont pas nécessaires au build. Une fois la paire configurée, les deux comptes activent leur Duo et choisissent leurs autorisations indépendamment.

Les tests utilisent des identifiants fictifs et une base PostgreSQL locale via PGlite. Aucun accès à un projet Supabase réel n’est nécessaire pour les lancer.
