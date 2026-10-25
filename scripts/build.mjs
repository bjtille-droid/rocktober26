import { access } from 'node:fs/promises';
const required = ['public/index.html', 'public/styles.css', 'public/community.js', 'public/game.js', 'public/game-core.js', 'api/index.js'];
await Promise.all(required.map(path => access(new URL('../' + path, import.meta.url))));
console.log('Rocktober static site and API are ready.');
