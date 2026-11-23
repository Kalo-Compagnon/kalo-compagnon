# Récaps hebdomadaires

Depuis la fenêtre du compte, la section « Récap de la semaine » se trouve immédiatement après « Synchroniser ». Le lecteur affiche uniquement le dernier bilan prêt, sans sélecteur de semaines. Un ancien lien de notification ouvre également le dernier bilan disponible. La lecture ne rappelle pas Gemini.

L’utilisateur peut générer la dernière semaine terminée et activer le récap automatique. La génération automatique est désactivée par défaut et accessible aux comptes autorisés pour Gemini dans `kermit_users`. Le dernier bilan disponible s’affiche à l’ouverture. Les anciens bilans ne sont plus proposés par le lecteur ni par les actions de lecture de la fonction Edge.

## Données et calculs

Le serveur calcule les moyennes, leur couverture et les écarts à la semaine précédente. Gemini reçoit uniquement cet agrégat, sans nom de compte, noms d’aliments, notes, messages, adresses e-mail ou photos. Le modèle rédige la synthèse et deux ou trois pistes générales ; il ne modifie pas les objectifs ou le journal.

- Calories moyennes : jours avec au moins une entrée dont toutes les calories sont renseignées.
- Protéines, glucides et lipides : moyennes des jours aux calories complètes et aux valeurs du nutriment entièrement renseignées. Une valeur inconnue reste `null`, jamais zéro.
- Dépense : formule Kalo (basal enregistré, pas, FIT et activité manuelle), uniquement pour les jours dont le basal et les pas sont exploitables.
- Déficit : moyenne des différences sur les mêmes jours, pas différence de deux moyennes couvrant des jours distincts.
- Pas : jours avec saisie ou import, y compris zéro. Les 300 pas de base de Kalo sont inclus et indiqués à l’écran.
- Poids : moyenne des pesées disponibles ; comparaison de moyennes uniquement avec au moins trois pesées dans chaque semaine. Les mensurations disponibles sont affichées séparément.
- Période : lundi à dimanche, avec arrêt des entrées alimentaires le dimanche à 21 h. Les agrégats journaliers reflètent les données synchronisées lors de la génération. Le rapport indique sa date réelle de génération et les données absentes.

Les conseils restent généraux : pas de diagnostic, de carence inventée, de prescription chiffrée, de compensation par le sport ni de projection de perte de poids.

## Serveur

`weekly-recap-schedule.sql` ajoute un décalage administré par compte : Coralie à 21 h et Loric à 21 h 05 le dimanche, heure de Paris (été et hiver). Le cron ne génère pas un bilan avant son créneau et le lecteur affiche l’heure du compte connecté. Les données des deux bilans restent arrêtées à 21 h.

Schéma installé sur `rlatjredsjvgjsbrqmtm` le 23 novembre 2026 via la migration `weekly_recaps`, depuis `weekly-recaps.sql`. Le CLI Windows était bloqué par le contrôle d’application ; le fichier SQL source a donc été appliqué par l’outil de migration Supabase, sans inventer de fichier de migration daté local.

Les tables `logger_weekly_preferences` et `logger_weekly_reports` sont sous RLS : lecture limitée à leur propriétaire, écritures exclusivement serveur. Les RPC `logger_weekly_claim` et `logger_weekly_source` sont réservées au rôle service et utilisent les droits de l’appelant.

Le traitement s’intègre à la fonction Edge `notifications`, avec la clé Gemini existante et le modèle stable `gemini-3.1-flash-lite` (surcharge dédiée `WEEKLY_GEMINI_MODEL`, sans modifier le modèle du chat Kermit). Les quotas Kermit sont partagés. Un bail de deux minutes avec jeton exclusif empêche les générations concurrentes et les écritures d’un ancien traitement ; trois tentatives maximum par semaine, espacées de dix minutes en cas d’échec. Un bilan déjà prêt ne peut pas être remplacé par ce mécanisme. Une semaine sans données n’appelle pas Gemini.

Le cron existant traite au plus une génération par minute pour ne pas monopoliser l’envoi des rappels. Son délai HTTP est porté à 60 secondes. La notification « Ton bilan de la semaine est prêt » respecte l’activation des notifications, l’heure d’arrêt choisie et la fenêtre du dimanche soir. Les appareils expirés sont retirés et les envois dédupliqués.

Les préférences désactivées ne déclenchent aucune analyse automatique. L’activation des rappels sur l’iPhone reste nécessaire pour recevoir une notification ; le bilan est consultable même sans notification.

## Génération ponctuelle interne

`weekly-recap-jobs.sql` ajoute une file interne de demandes ponctuelles, sous RLS et sans accès utilisateur. Le rôle service ne peut que lire ces demandes ; leur insertion et leur retrait passent par l’administrateur. Aucun point d’entrée HTTP d’administration n’est ajouté.

Le cron existant traite une demande pour la dernière semaine terminée uniquement si son compte figure aussi dans `kermit_users`. Les quotas et baux habituels s’appliquent. Le champ `notify`, ajouté par `weekly-recap-job-notifications.sql`, autorise une alerte ponctuelle explicite hors de la fenêtre du dimanche. L’activation des notifications, l’heure d’arrêt et la déduplication restent respectées. Après traitement, l’administrateur retire la demande. Cela ne crée ni ne modifie la préférence de génération automatique et ne peut pas déclencher de génération pour les semaines suivantes.

`weekly-recap-diagnostics.sql` ajoute un diagnostic réservé au serveur : codes HTTP Google, dépassement de délai ou réponse structurée invalide. Les codes proviennent d’une liste contrôlée et ne contiennent aucun texte du modèle, secret ou donnée du journal. Le navigateur conserve un message d’indisponibilité sans exposer ces détails.

`weekly-recap-provider-diagnostics.sql` distingue les motifs des erreurs 503 : forte demande, surcharge, capacité ou indisponibilité. Seule une catégorie fixe est conservée, jamais le message brut de Google. Le diagnostic `google_503_high_demand` confirme une forte demande signalée par le fournisseur ; décaler les deux comptes ne garantit pas la disponibilité globale de Gemini.

## Tests

`npm test` vérifie les périodes (dont les changements d’heure), calculs, données absentes, immutabilité, baux et droits SQL. `npm run test:browser:recap` vérifie à 390 et 1440 px la zone sous la synchronisation, l’ouverture du dernier bilan uniquement, l’activation, la génération et l’ouverture depuis une notification, avec des données fictives. Aucun test automatisé n’envoie de données réelles à Gemini ni de notification à un téléphone.
