import { copyFile, cp, writeFile } from 'node:fs/promises';
// Keep app.html as the development entry. index.html is ready for any static host.
await copyFile('dist/app.html', 'dist/index.html');
await copyFile('dist/index.html', 'index.html');
await cp('dist/assets', 'assets', {recursive:true});
await copyFile('dist/manifest.webmanifest', 'manifest.webmanifest');
await writeFile('.nojekyll', '');
console.log('Site statique prêt à publier depuis main / (root).');
