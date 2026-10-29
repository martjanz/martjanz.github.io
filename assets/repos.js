// Pure logic for the repo listing. No DOM access here, so it can be unit-tested with Node.

export const USER = 'martjanz';
export const PAGES_HOST = `${USER}.github.io`;

/** Returns a safe http(s) URL string or null. */
export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let raw = value.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`; // "example.com" -> https
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The URL of a working page for a repo, or null.
 * Priority: the repo's "homepage" field, then its GitHub Pages site.
 */
export function liveUrl(repo) {
  const home = safeUrl(repo.homepage);
  if (home) return home;
  if (repo.has_pages) return `https://${PAGES_HOST}/${encodeURIComponent(repo.name)}/`;
  return null;
}

/** Hides forks, archived repos and this site's own repo. */
export function isListed(repo) {
  return !repo.fork && !repo.archived && repo.name.toLowerCase() !== PAGES_HOST;
}

/** Normalizes GitHub API objects into what the page renders. */
export function toCard(repo) {
  return {
    name: repo.name,
    description: repo.description || '',
    url: repo.html_url,
    live: liveUrl(repo),
    language: repo.language || null,
    stars: repo.stargazers_count || 0,
    updated: repo.pushed_at || repo.updated_at || null,
    topics: Array.isArray(repo.topics) ? repo.topics : [],
  };
}

/** Repos with a working page first, then most recently updated. */
export function sortCards(cards) {
  return [...cards].sort((a, b) => {
    if (!!a.live !== !!b.live) return a.live ? -1 : 1;
    return (Date.parse(b.updated) || 0) - (Date.parse(a.updated) || 0);
  });
}

/** Case- and accent-insensitive search over name, description, language and topics. */
export function normalize(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filterCards(cards, { query = '', onlyLive = false } = {}) {
  const q = normalize(query.trim());
  return cards.filter((c) => {
    if (onlyLive && !c.live) return false;
    if (!q) return true;
    const haystack = normalize([c.name, c.description, c.language || '', ...c.topics].join(' '));
    return q.split(/\s+/).every((word) => haystack.includes(word));
  });
}

export function prepare(apiRepos) {
  return sortCards(apiRepos.filter(isListed).map(toCard));
}

/** "Updated" label in the visitor's language, e.g. "Oct 2026" / "oct. 2026". */
export function formatMonth(iso, lang) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-AR' : 'en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(t));
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
