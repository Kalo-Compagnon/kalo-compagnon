# Mettre Logger sur GitHub

1. Le dépôt contient maintenant la version compilée : `index.html`, `assets/`, `manifest.webmanifest` et `.nojekyll` peuvent être servis directement.
2. Ne pas envoyer `node_modules`, `dist`, `.env.local`, les fichiers `.log` ni les sauvegardes personnelles. Le `.gitignore` les exclut pour un envoi avec Git.
3. Dans **Settings → Pages**, conserver **Deploy from a branch → main → / (root)**. C'est le réglage actuel du dépôt.
4. Après une modification du code, exécuter `npm run build`, puis committer les sources ET les fichiers statiques générés. Pousser sur `main` : GitHub Pages publie le site automatiquement. Le workflow « Vérifier Logger » contrôle les tests et la compilation.

`app.html` est l'entrée de développement. Ne pas remplacer `index.html` par cette entrée React : les navigateurs ne peuvent pas exécuter directement les fichiers TSX.

Les chemins des ressources fonctionnent aussi sous `https://utilisateur.github.io/nom-du-depot/`.

GitHub Pages publie la partie web uniquement. Le stockage local et les imports/exports fonctionnent. Pour retrouver les données sur plusieurs appareils, configurer Supabase dans `.env.local` comme expliqué dans README.md, recompiler puis pousser les fichiers générés. Le fichier `.env.local` reste exclu de Git.

Le décodeur Java des fichiers FIT de monitoring quotidien ne peut pas fonctionner sur GitHub Pages : il nécessite le serveur fourni. Les FIT de sessions sportives sont décodés dans le navigateur. Pour disposer aussi du monitoring, déployer l'application complète avec le Dockerfile.

Documentation officielle : https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
