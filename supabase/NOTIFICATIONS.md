# Rappels iPhone

Le frontend propose un espace Notifications dans la fenêtre de compte. Il enregistre les préférences par compte et abonne l’iPhone actif. Aucun mot de passe ni jeton Supabase n’est envoyé au service push Apple.

## Comportement

- Désactivé par défaut. L’utilisateur choisit les rappels et doit autoriser Kalo depuis son installation sur l’écran d’accueil iOS 16.4 ou ultérieur.
- Pesée manquante : absence de poids positif dans le document du jour.
- Pas manquants : absence de saisie de pas ou d’import FIT pour ce jour. Zéro saisi est une valeur valide ; les 300 pas automatiques ne comptent pas comme une saisie.
- Repas manquant : aucune entrée alimentaire dans le créneau du repas, ou calories encore manquantes. Les entrées sont rattachées au repas attendu le plus proche de leur heure, dans le fuseau configuré. Les boissons seules ne complètent pas un repas. Un repas peut être indiqué comme sauté pour la journée.
- Rappels avant repas : envoi indépendant de la présence d’entrées, au délai choisi avant les quatre horaires.
- « Plus tard » dans Kalo : relance après 45 minutes, puis par cycles de 45 minutes tant que la saisie manque. Aucun cycle n’est activé sans ce choix. Arrêt à la complétion synchronisée, à l’heure limite choisie (22 h par défaut), ou au changement de journée.
- Le cron tourne chaque minute, en heure locale de Paris par défaut, avec prise en compte des changements d’heure. Les rappels push dépendent ensuite de la connexion et des réglages iOS ; leur réception n’est pas une alarme à heure garantie.
- Chaque envoi est réservé en base avant l’appel à Apple. Les doublons du cron sont évités ; les erreurs temporaires sont réessayées au plus trois fois avec un bail de deux minutes. Les abonnements supprimés par Apple sont retirés.
- Une saisie hors ligne ne peut arrêter les rappels serveur qu’après synchronisation.

## Serveur activé

Installation autorisée et réalisée le 23 novembre 2026 sur le projet existant `rlatjredsjvgjsbrqmtm` : migration des tables et RPC, fonction Edge `notifications` et tâches `kalo-push-reminders` / `kalo-push-cleanup` actives. Vérification distante : accès non authentifiés refusés (401), tâche exécutée avec succès, appel serveur authentifié en 200, clés VAPID initialisées et tables sous RLS. Aucun abonnement utilisateur ni préférence active au moment du contrôle ; aucun rappel envoyé à un téléphone.

Référence d’installation pour un nouvel environnement :

1. Appliquer `migrations/20261123020508_web_push_reminders.sql` sur le projet existant. Ne pas réexécuter le schéma général.
2. Déployer `functions/notifications/index.ts`, avec les deux modules `_shared/notification-rules.ts` et `_shared/notifications-handler.ts`, `deno.json` et le verrou des dépendances. Désactiver la vérification JWT du proxy : la fonction vérifie elle-même les utilisateurs via `auth.getUser`, et le cron exige son propre secret.
3. Exécuter `notifications-activation.sql` sur le même projet. Il génère le secret du cron en base et le place dans Vault, puis planifie les rappels et leur nettoyage. Les préférences désactivées et l’absence d’abonnement empêchent tout envoi tant que les utilisateurs n’activent pas les rappels.
4. Vérifier les droits/RLS, les deux tâches cron et un appel sans authentification (401 attendu). La clé VAPID est générée à la première consultation authentifiée et conservée en schéma privé ; seule la clé publique est renvoyée au navigateur.
5. Publier les fichiers frontend et le nouveau `sw.js`. Ouvrir Kalo depuis son icône sur chaque iPhone, se connecter au bon compte, régler les rappels, autoriser cet iPhone puis utiliser « Envoyer un test ».

Les tables d’abonnements et les clés sont privées. Les écritures passent exclusivement par la fonction Edge qui valide l’utilisateur, les horaires, les endpoints Apple et l’adresse de l’application. Les RPC serveur ne sont accessibles qu’au rôle service ; elles utilisent les droits de l’appelant et n’ajoutent aucune fonction `SECURITY DEFINER` publique.

Le contrôle Supabase signale les tables `kalo_private.push_configuration` et `logger_push_deliveries` comme ayant RLS sans politique : c’est volontaire, elles sont exclusivement réservées au serveur et aucun droit n’est accordé à `anon` ou `authenticated`. Voir [l’avis Supabase correspondant](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Les droits sur les clés et le schéma privé ont été contrôlés séparément.

Lors d’un changement de compte ou d’une déconnexion depuis Kalo, l’abonnement local est révoqué et retiré du compte précédent. À l’ouverture d’un compte ayant activé ses rappels, l’appareil est réabonné sans nouvelle demande iOS si l’autorisation existe. Les abonnements d’un autre compte ne peuvent pas être lus par l’utilisateur. Un clic sur une ancienne notification demande de sélectionner le compte correspondant.

## Vérification locale

`npm test` couvre les règles horaires, la complétion, le report, la fonction HTTP, les droits SQL et le worker. `npm run test:browser:notifications` vérifie la fenêtre et les actions à 390 et 1440 px avec un serveur simulé. La fonction est vérifiable avec Deno, via sa configuration locale. Aucun test automatisé n’envoie de notification à un téléphone réel.
