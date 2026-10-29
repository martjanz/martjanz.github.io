// Pure logic for the repo listing, shared by the build script (Node) and the page (browser).

export const USER = 'martjanz';
export const PAGES_HOST = `${USER}.github.io`;
export const MAX_TAGS = 6;

// Languages that rarely describe a project's stack; shown only when nothing else is detected.
const MINOR_LANGS = new Set(['HTML', 'CSS', 'SCSS', 'Shell', 'Makefile', 'Dockerfile', 'Batchfile', 'PowerShell', 'Procfile']);

/** The repo's GitHub Pages URL, or null when Pages isn't enabled. */
export function liveUrl(repo) {
  return repo.has_pages ? `https://${PAGES_HOST}/${encodeURIComponent(repo.name)}/` : null;
}

/** Hides forks, archived repos and this site's own repo. */
export function isListed(repo) {
  return !repo.fork && !repo.archived && repo.name.toLowerCase() !== PAGES_HOST;
}

/**
 * Main languages from GitHub's byte counts ({ Go: 120000, Svelte: 40000, ... }):
 * those with at least `minShare` of the code, largest first, at most `max`.
 */
export function mainLanguages(bytesByLang, { minShare = 0.1, max = 3 } = {}) {
  const entries = Object.entries(bytesByLang || {}).filter(([, n]) => n > 0);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (!total) return [];
  return entries
    .filter(([, n]) => n / total >= minShare)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([lang]) => lang);
}

/** Case-insensitive de-duplication that keeps the first spelling. */
export function uniqueTags(tags) {
  const seen = new Set();
  return tags.filter((t) => {
    const key = String(t).toLowerCase();
    if (!t || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Tags shown for a repo: the hand-written list from projects.json when present,
 * otherwise main languages, then detected frameworks/tools, then GitHub topics.
 */
export function techTags(repo, languages, override, detected = []) {
  if (override && Array.isArray(override.tech)) return uniqueTags(override.tech).slice(0, MAX_TAGS);
  let langs = languages && Object.keys(languages).length ? mainLanguages(languages) : [repo.language].filter(Boolean);
  const major = langs.filter((l) => !MINOR_LANGS.has(l));
  if (major.length || detected.length) langs = major;
  const topics = Array.isArray(repo.topics) ? repo.topics : [];
  return uniqueTags([...langs, ...detected, ...topics]).slice(0, MAX_TAGS);
}

/** Description as { es, en } (either may be empty); projects.json wins over GitHub's text. */
export function descriptions(repo, override) {
  const base = repo.description || '';
  const d = override && override.description;
  if (typeof d === 'string') return { es: d, en: d };
  return { es: (d && d.es) || base, en: (d && d.en) || base };
}

/** Keeps only what the page renders. */
export function toCard(repo, { languages = null, override = null, detected = [] } = {}) {
  return {
    name: repo.name,
    description: descriptions(repo, override),
    url: repo.html_url,
    live: liveUrl(repo),
    tags: techTags(repo, languages, override, detected),
    stars: repo.stargazers_count || 0,
    updated: repo.pushed_at || repo.updated_at || null,
  };
}

export const SORTS = ['updated', 'name', 'stars'];

const byDate = (a, b) => (Date.parse(b.updated) || 0) - (Date.parse(a.updated) || 0);
const byName = (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });

/** Sorts a copy: 'updated' (newest first), 'name' (A–Z) or 'stars' (most first, then newest). */
export function sortCards(cards, by = 'updated') {
  const compare = {
    updated: (a, b) => byDate(a, b) || byName(a, b),
    name: byName,
    stars: (a, b) => (b.stars || 0) - (a.stars || 0) || byDate(a, b) || byName(a, b),
  }[by] || ((a, b) => byDate(a, b) || byName(a, b));
  return [...cards].sort(compare);
}

/**
 * apiRepos: GitHub API repo objects. extras.languages: { [repoName]: bytesByLang }.
 * extras.detected: { [repoName]: [tags from manifests] }.
 * extras.overrides: projects.json contents, { [repoName]: { description, tech } }.
 */
export function prepare(apiRepos, { languages = {}, detected = {}, overrides = {} } = {}) {
  return sortCards(
    apiRepos.filter(isListed).map((r) => toCard(r, {
      languages: languages[r.name], detected: detected[r.name] || [], override: overrides[r.name],
    })),
  );
}

/** Case- and accent-insensitive. */
export function normalize(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Text of a card's description in one language (accepts the old plain-string shape too). */
export function describe(card, lang) {
  const d = card.description;
  if (typeof d === 'string') return d;
  return (d && (d[lang] || d.es || d.en)) || '';
}

/** Every word in the query must appear in name, descriptions or tags. */
export function filterCards(cards, { query = '', onlyLive = false } = {}) {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return cards.filter((c) => {
    if (onlyLive && !c.live) return false;
    const haystack = normalize([c.name, describe(c, 'es'), describe(c, 'en'), ...(c.tags || [])].join(' '));
    return words.every((w) => haystack.includes(w));
  });
}

/** e.g. "Oct 2026" / "oct 2026". */
export function formatMonth(iso, lang) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-AR' : 'en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(t)).replace('.', '');
}

/** Initial language: saved choice, else the browser's, else Spanish. */
export function pickLanguage(saved, browserLangs = []) {
  if (saved === 'es' || saved === 'en') return saved;
  for (const l of browserLangs) {
    const base = String(l).slice(0, 2).toLowerCase();
    if (base === 'es' || base === 'en') return base;
  }
  return 'es';
}
