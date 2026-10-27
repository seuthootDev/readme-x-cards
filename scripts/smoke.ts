// Calls the real (unofficial) sources. Not part of CI: run manually to check the sources still work
// and to refresh the README preview images.
import { mkdir, writeFile } from 'node:fs/promises';
import { CACHE, feedCard, postCard, profileCard } from '../src/cards.js';
import { themeNames } from '../src/themes/index.js';

const USER = process.argv[2] ?? 'Seuthoot';
const OUT = 'docs/previews';

await mkdir(OUT, { recursive: true });
let failed = false;

for (const theme of themeNames) {
  const cards = {
    profile: await profileCard(new URLSearchParams({ user: USER, theme })),
    post: await postCard(new URLSearchParams({ user: USER, index: '1', theme })),
    famous: await postCard(new URLSearchParams({ id: '20', theme })),
    feed: await feedCard(new URLSearchParams({ user: USER, count: '3', theme })),
  };
  for (const [kind, card] of Object.entries(cards)) {
    const file = `${OUT}/${theme}-${kind}.svg`;
    await writeFile(file, card.svg);
    const errorCaches: string[] = [CACHE.clientError, CACHE.notFound, CACHE.upstreamError];
    const isError = errorCaches.includes(card.cacheControl);
    if (isError) failed = true;
    console.log(`${isError ? 'FAIL' : 'ok  '} ${file}`);
  }
}

process.exit(failed ? 1 : 0);
