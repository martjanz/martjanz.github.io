// Builds the static site into _site/: copies the published files and writes repos.json
// from the GitHub API. Run by .github/workflows/pages.yml; locally: `npm run build`.
import { cpSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER, prepare } from '../assets/repos.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Top-level entries that are source/tooling, not site content.
export const EXCLUDE = new Set([
  '.git', '.github', '.gitmodules', '.gitignore', '_site', 'node_modules',
  'scripts', 'tests', 'package.json', 'package-lock.json', 'README.md',
]);

/** Fetches all public repos owned by USER, following pagination. */
export async function fetchAllRepos({ fetchImpl = fetch, token = '' } = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': `${USER}-site-build` };
  if (token) headers.Authorization = `Bearer ${token}`;
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const url = `https://api.github.com/users/${USER}/repos?type=owner&per_page=100&page=${page}`;
    const res = await fetchImpl(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

export async function build({ root = ROOT, out = join(ROOT, '_site'), fetchImpl, token, now = new Date() } = {}) {
  const repos = prepare(await fetchAllRepos({ fetchImpl, token }));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const entry of readdirSync(root)) {
    if (!EXCLUDE.has(entry)) cpSync(join(root, entry), join(out, entry), { recursive: true, filter: (src) => basename(src) !== '.git' });
  }
  writeFileSync(join(out, 'repos.json'), JSON.stringify({ generated: now.toISOString(), repos }));
  return repos;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repos = await build({ token: process.env.GITHUB_TOKEN });
  console.log(`Built _site with ${repos.length} repos (${repos.filter((r) => r.live).length} with a page).`);
}
