# Mettre Logger sur GitHub

1. Créer un dépôt GitHub et y envoyer **le contenu de webapp à la racine**, notamment `.github`, `src`, `public`, `package.json` et `package-lock.json`.
2. Ne pas envoyer `node_modules`, `dist`, `.env.local`, les fichiers `.log` ni les sauvegardes personnelles. Le `.gitignore` les exclut pour un envoi avec Git.
3. Dans **Settings → Pages → Source**, choisir **GitHub Actions**.
4. Dans **Actions → Publier Logger**, lancer **Run workflow**, ou pousser sur `main`. Le lien du site apparaît après le déploiement.

Les chemins des ressources fonctionnent aussi sous `https://utilisateur.github.io/nom-du-depot/`.

GitHub Pages publie la partie web uniquement. Le stockage local et les imports/exports fonctionnent. Pour retrouver les données sur plusieurs appareils, configurer Supabase comme expliqué dans README.md, et ajouter les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` dans **Settings → Secrets and variables → Actions → Variables**, puis relancer le déploiement.

Le décodeur Java des fichiers FIT de monitoring quotidien ne peut pas fonctionner sur GitHub Pages : il nécessite le serveur fourni. Les FIT de sessions sportives sont décodés dans le navigateur. Pour disposer aussi du monitoring, déployer l'application complète avec le Dockerfile.

Documentation officielle : https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
