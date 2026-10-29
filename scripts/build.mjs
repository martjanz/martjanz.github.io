// Builds the static site into _site/: copies the published files and writes repos.json
// from the GitHub API plus projects.json. Run by .github/workflows/pages.yml; locally: `npm run build`.
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER, isListed, prepare } from '../assets/repos.js';
import { pickManifests, detectTech } from './tech.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Top-level entries that are source/tooling, not site content.
export const EXCLUDE = new Set([
  '.git', '.github', '.gitmodules', '.gitignore', '_site', 'node_modules',
  'scripts', 'tests', 'package.json', 'package-lock.json', 'README.md', 'projects.json',
]);

function apiHeaders(token) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': `${USER}-site-build` };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Fetches all public repos owned by USER, following pagination. */
export async function fetchAllRepos({ fetchImpl = fetch, token = '' } = {}) {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const url = `https://api.github.com/users/${USER}/repos?type=owner&per_page=100&page=${page}`;
    const res = await fetchImpl(url, { headers: apiHeaders(token) });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

/**
 * Language byte counts per repo name. A failed request only drops that repo's
 * breakdown (the page then falls back to its main language), with a warning.
 */
export async function fetchLanguages(repos, { fetchImpl = fetch, token = '', warn = console.warn } = {}) {
  const result = {};
  await Promise.all(repos.map(async (r) => {
    const url = `https://api.github.com/repos/${USER}/${encodeURIComponent(r.name)}/languages`;
    try {
      const res = await fetchImpl(url, { headers: apiHeaders(token) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      result[r.name] = await res.json();
    } catch (err) {
      warn(`languages for ${r.name}: ${err.message}`);
    }
  }));
  return result;
}

/**
 * Frameworks/tools per repo name, detected from dependency manifests in the default branch.
 * Failures (empty repo, API error) only drop that repo's detection, with a warning.
 */
export async function fetchDetected(repos, { fetchImpl = fetch, token = '', warn = console.warn } = {}) {
  const result = {};
  await Promise.all(repos.map(async (r) => {
    const base = `https://api.github.com/repos/${USER}/${encodeURIComponent(r.name)}`;
    const ref = encodeURIComponent(r.default_branch || 'HEAD');
    try {
      const treeRes = await fetchImpl(`${base}/git/trees/${ref}?recursive=1`, { headers: apiHeaders(token) });
      if (treeRes.status === 409) return; // empty repository
      if (!treeRes.ok) throw new Error(`tree HTTP ${treeRes.status}`);
      const tree = await treeRes.json();
      const paths = (tree.tree || []).filter((e) => e.type === 'blob').map((e) => e.path);
      const files = {};
      for (const path of pickManifests(paths)) {
        const url = `${base}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${ref}`;
        const res = await fetchImpl(url, { headers: { ...apiHeaders(token), Accept: 'application/vnd.github.raw' } });
        if (res.ok) files[path] = await res.text();
      }
      result[r.name] = detectTech(files);
    } catch (err) {
      warn(`tech detection for ${r.name}: ${err.message}`);
    }
  }));
  return result;
}

/** projects.json: hand-written descriptions (ES/EN) and tech tags, keyed by repo name. */
export function readOverrides(root) {
  const file = join(root, 'projects.json');
  if (!existsSync(file)) return {};
  const data = JSON.parse(readFileSync(file, 'utf8'));
  delete data.$comment;
  return data;
}

export async function build({ root = ROOT, out = join(ROOT, '_site'), fetchImpl, token, now = new Date(), warn } = {}) {
  const overrides = readOverrides(root);
  const apiRepos = await fetchAllRepos({ fetchImpl, token });
  const listed = apiRepos.filter(isListed);
  const [languages, detected] = await Promise.all([
    fetchLanguages(listed, { fetchImpl, token, warn }),
    fetchDetected(listed, { fetchImpl, token, warn }),
  ]);
  const repos = prepare(apiRepos, { languages, detected, overrides });

  const unknown = Object.keys(overrides).filter((name) => !apiRepos.some((r) => r.name === name));
  if (unknown.length) (warn || console.warn)(`projects.json has entries for unknown repos: ${unknown.join(', ')}`);

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
  for (const r of repos) console.log(`  ${r.name}: ${r.tags.join(', ') || '(no tags)'}`);
}
