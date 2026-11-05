# Livraison Corps et Duo

La navigation comporte Accueil, Repas, Corps et Duo (cœur). Corps conserve Activité et Mensurations, avec Activité par défaut. Les données personnelles, IndexedDB, tombstones et synchronisation restent indépendants.

Duo reprend deux synthèses de l’Accueil en lecture seule, chacune dans son accent, avec des prénoms centrés. Les cartes de pas sont séparées et entièrement colorées. Le graphique commun affiche deux barres par jour : accent pour la dépense, accent foncé hachuré pour l’apport. Les hauteurs utilisent une échelle commune en kcal. Les deux repères translucides indiquent chacun 50 % du maximum individuel sur la période. Les blocs poids et mensurations ont été retirés de Duo à la demande de l’utilisateur, sans supprimer leurs données personnelles.

Le halo existant utilise deux moitiés égales, conformément au choix validé. Les textes du bilan sont contrastés dans l’accent du profil. La réduction automatique de police concerne uniquement Duo ; Accueil conserve sa taille initiale. Les paddings Duo sont réduits, avec 18 px entre sections/colonnes. Les petits textes explicatifs répétitifs ont été retirés.

## Liaison et sécurité

L’invitation par code expire après 24 heures et nécessite une acceptation explicite. Une seule liaison est autorisée par compte. Les cinq catégories sont privées par défaut et réglables dans Compte → Partage Duo. La révocation supprime la liaison et ses permissions.

La fonction authentifiée logger_duo filtre les clés ET les champs côté serveur. Les politiques RLS personnelles restent intactes. Les tables Duo ont RLS et aucun accès direct pour anon/authenticated. Les opérations sont sérialisées par verrou transactionnel. Aucun droit d’écriture sur le partenaire n’est ajouté.

Les données partagées ne sont jamais écrites dans IndexedDB ni dans les exports personnels. L’affichage est retiré lors d’une relecture, d’une erreur réseau ou du masquage de l’onglet. Les réponses périmées sont ignorées. Les données sont relues toutes les 30 secondes et au retour dans l’onglet : une révocation distante est constatée à la prochaine lecture, sans diffusion en temps réel.

## Démonstration autorisée

Le compte test a reçu des données fictives via logger_put et la préférence settings/duoDemo=true, avec autorisation explicite. Ses données et réglages préexistants ont été conservés. Aucun vrai compte Coralie/Loric ni aucune liaison réelle n’ont été consultés ou modifiés pour la démonstration.

Les deux profils fictifs sont inclus dans demo/duo-demo.json. Ce mode ne fait aucun appel à logger_duo et ne propose aucune commande d’édition, liaison ou partage. Les générateurs locaux ne contiennent aucun identifiant et n’effectuent aucun accès réseau. Voir demo/README.md.

## Étapes Supabase avant publication du Duo réel

La migration additive supabase/migrations/20261105_duo.sql n’a pas été appliquée au projet distant. Préparer une instance locale/de test avec supabase/schema.sql puis la migration. Y exécuter supabase/duo-security-test.sql avec une connexion administrateur : les trois comptes fictifs sont créés dans une transaction terminée par ROLLBACK. Ne pas exécuter ce script sur les comptes de production.

Vérifier ensuite les cinq catégories, les acceptations concurrentes, les codes expirés, les sessions expirées et les révocations entre deux navigateurs. Après autorisation explicite seulement, appliquer la migration versionnée au projet distant. Ne pas réexécuter aveuglément schema.sql sur une base existante : les politiques personnelles existent déjà.

Les contrôles SQL n’ont pas été exécutés, faute de serveur PostgreSQL/Supabase local disponible. La sécurité SQL reste à vérifier par exécution avant publication du Duo réel. Aucune clé service_role ni nouvelle dépendance n’est ajoutée.

## Vérifications

- npm.cmd test : 46 tests réussis, dont isolation, confidentialité initiale, palettes, échelle calorique commune et repères individuels.
- npm.cmd run build : réussi ; avertissement Vite existant sur l’import statique/dynamique de persistence.
- Parcours navigateur existants adaptés ; tests Duo réel simulé et démonstration : lecture seule, réseau, déconnexion, isolation IndexedDB, couleurs/hachures, repères translucides et espacements.
- Largeurs Chromium : 320, 390, 768, 844 et 1440, en clair/sombre. Safari/iOS réel non testé.
- Parcours mensurations : anciennes valeurs, saisie et rechargement vérifiés. Comparaison avec l’ancienne capture Android ignorée car le fichier de référence manque.

## GitHub

Sources, tests, migrations, démonstrations fictives et fichiers statiques compilés sont fournis ensemble. Un push sur main publie automatiquement le site selon GITHUB.md. Les changements sont donc poussés sur une branche dédiée pour respecter la consigne de ne pas déployer sans autorisation. Le schéma Supabase n’est pas modifié par ce push.
