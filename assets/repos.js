// Pure logic for the repo listing, shared by the build script (Node) and the page (browser).

export const USER = 'martjanz';
export const PAGES_HOST = `${USER}.github.io`;

/** The repo's GitHub Pages URL, or null when Pages isn't enabled. */
export function liveUrl(repo) {
  return repo.has_pages ? `https://${PAGES_HOST}/${encodeURIComponent(repo.name)}/` : null;
}

/** Hides forks, archived repos and this site's own repo. */
export function isListed(repo) {
  return !repo.fork && !repo.archived && repo.name.toLowerCase() !== PAGES_HOST;
}

/** Keeps only what the page renders. */
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

export function prepare(apiRepos) {
  return sortCards(apiRepos.filter(isListed).map(toCard));
}

/** Case- and accent-insensitive. */
export function normalize(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Every word in the query must appear in name, description, language or topics. */
export function filterCards(cards, { query = '', onlyLive = false } = {}) {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return cards.filter((c) => {
    if (onlyLive && !c.live) return false;
    const haystack = normalize([c.name, c.description, c.language || '', ...c.topics].join(' '));
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
