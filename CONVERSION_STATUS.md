# État de la conversion

Le code Android reste intact. L'ancien prototype est conservé dans `legacy-prototype/`. La version active utilise React/TypeScript, IndexedDB et Supabase optionnel.

| Fonction Android | Port web | Vérification |
|---|---|---|
| Navigation Global/Repas/Mensuration/Activité | 4 onglets, couleurs et ressources source | Captures quatre formats ; comparaison actuelle en attente |
| Moyenne glissante, basal, déficit, pas | Float32 aux mêmes étapes que Kotlin | Tests, dont 3 000 résultats Java exacts |
| Historique et édition des dates passées | Références par journée, bandeau Terminer | Domaine et édition passée testés dans le navigateur |
| Aliment, recherche, favoris, quantité et macros | Base source complète, catégories et limite de 40 | Calculs, saisie personnalisée et quantités variables testés |
| Composition, variables, repas enregistrés | Création, édition, suppression, usage/favoris | Calculs, saisie personnalisée et quantités variables testés |
| Extra avec photo, calories à estimer | Fichier/caméra, édition et suppression | Persistance et sauvegarde testées |
| Mensurations | Silhouette source, rubans, 8 zones, 4 vues, historique, mesure secrète | Captures et saisie testées ; iPhone réel à vérifier |
| Activité FIT session | SDK Garmin JS 21.214.0, mêmes règles de cumul et empreintes | Métriques testées |
| Activité FIT monitoring quotidien | Service Node + Garmin Java 21.214.0, même MonitoringReader | Test HTTP synthétique : 2 000 pas / 90 kcal |
| Export CSV Android | Import avec aperçu ; distinction calories null/zéro | Tests d'import et calculs |
| Export/import web complet | JSON et CSV avec payloads complets, photos incluses | Tests aller-retour |
| Poids/taille/photo historique | Accessible depuis Données | Saisie testée dans le navigateur |
| Ancien catalogue et assistant | 60 plats extraits, taux/quantités persistés ; assistant 9 familles | Assistant Collation testé dans le navigateur |
| Authentification, synchronisation distante | RLS, révisions, tombstones, conflits explicites | Tests avec serveur simulé ; Supabase réel non configuré |

## Écarts et adaptations explicites

- Les captures Android de septembre montrent un ancien écran Global. La version actuelle du source affiche une moyenne glissante, sans les anciens sélecteurs Jour/Semaine/14 jours. Le web suit ce source actuel.
- Les captures sont assombries ; les couleurs sont reprises des XML et du Kotlin, sans reproduire cet assombrissement.
- La navigation système Android, les permissions système et le sélecteur de photo sont remplacés par ceux du navigateur. Sur iPhone, la caméra dépend de Safari et d'un hébergement HTTPS. Les notifications Toast utilisent un message web.
- Le graphique et la silhouette sont portés vers Canvas. Les ressources PNG et les chemins des icônes vectorielles sont ceux d'Android. Les rubans et étiquettes doivent encore être comparés visuellement. La sélection par étiquette, le balayage et la sélection directe sur le corps reprennent les zones du Kotlin.
- Sur ordinateur, Global utilise deux colonnes ; les autres parcours conservent leur ordre et une largeur de lecture limitée. Les boîtes natives sont remplacées par des dialogues web avec fermeture clavier et arrière-plan modal.
- Les actions par appui long sont aussi accessibles par un bouton de menu pour la souris et le clavier. Les entrées peuvent être modifiées directement dans le web.
- Les outils Android devenus inaccessibles depuis MainActivity sont regroupés dans Données > Repas · outils historiques, et Progression physique. Aucun onglet principal supplémentaire.
- Les fichiers FIT quotidiens requièrent le service Java fourni, déployé avec le frontend. Une publication purement statique doit ajouter ce service séparément. Le Dockerfile prépare le frontend et ce service ; il n'a pas été déployé.
- Le CSV Android ne contient ni les photos binaires, ni les mensurations SharedPreferences, ni les empreintes FIT, ni tous les paramètres. Ces informations ne peuvent pas être récupérées depuis ce seul CSV. L'import conserve les valeurs disponibles et affiche les omissions avant validation.
- Le prototype antérieur stockait des totaux sans journal réel : son localStorage n'est ni effacé ni transformé en faux historique. Son interface est archivée ; exporter ses valeurs séparément si nécessaire.
- Sans configuration Supabase, les données persistent sur l'appareil uniquement. La synchronisation entre appareils n'est pas active. Les tests avec un service simulé ne remplacent pas un test réel iPhone/PC.
- Le manifeste permet l'installation, mais le chargement initial et le rechargement de l'app nécessitent le réseau. Les données déjà enregistrées restent en IndexedDB. Aucun mode entièrement hors ligne n'est annoncé.

## Vérification restant nécessaire

1. Playwright autorisé et exécuté : quatre formats, navigation, ajout/modification/suppression, photos, repas variables, progression, historique et export/import. Aucun débordement horizontal ni exception JavaScript détectés. Les 19 tests automatiques passent. Voir `qa/extended-results.json` et `design-qa.md`.
2. Captures Android actuelles de chaque écran pour la comparaison au même état et à la même densité ; les captures disponibles ne suffisent pas à valider toute l'interface.
3. Projet Supabase configuré (URL et clé publique), SQL appliqué et comptes de test pour valider RLS/auth et synchronisation effective.
4. Validation sur iPhone réel, photos et fichiers FIT réels de l'utilisateur.

La conversion n'est pas déclarée visuellement identique ou prête pour production tant que ces contrôles restent ouverts.
