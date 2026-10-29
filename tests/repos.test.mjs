import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  liveUrl, isListed, toCard, sortCards, filterCards, prepare, formatMonth, pickLanguage, normalize,
  mainLanguages, uniqueTags, techTags, descriptions, describe, MAX_TAGS,
} from '../assets/repos.js';
import { repo } from './helpers.mjs';

test('liveUrl only uses GitHub Pages, never the homepage field', () => {
  assert.equal(liveUrl(repo({ has_pages: true, name: 'campomap' })), 'https://martjanz.github.io/campomap/');
  assert.equal(liveUrl(repo({ homepage: 'https://elsewhere.dev' })), null);
  assert.equal(liveUrl(repo({ has_pages: true, name: 'a b' })), 'https://martjanz.github.io/a%20b/');
});

test('isListed hides forks, archived repos and the site repo itself', () => {
  assert.equal(isListed(repo()), true);
  assert.equal(isListed(repo({ fork: true })), false);
  assert.equal(isListed(repo({ archived: true })), false);
  assert.equal(isListed(repo({ name: 'MartJanz.github.io' })), false);
});

test('mainLanguages keeps languages with >= 10% of bytes, largest first, max 3', () => {
  assert.deepEqual(mainLanguages({ JavaScript: 300, Go: 600, CSS: 50, Svelte: 150, HTML: 20 }), ['Go', 'JavaScript', 'Svelte']);
  assert.deepEqual(mainLanguages({ Python: 1000, Shell: 5 }), ['Python']);
  assert.deepEqual(mainLanguages({}), []);
  assert.deepEqual(mainLanguages(null), []);
  assert.deepEqual(mainLanguages({ A: 1, B: 1, C: 1, D: 1 }), ['A', 'B', 'C']);
});

test('uniqueTags is case-insensitive and keeps the first spelling', () => {
  assert.deepEqual(uniqueTags(['Python', 'python', 'FastAPI', '', 'fastapi', 'leaflet']), ['Python', 'FastAPI', 'leaflet']);
});

test('techTags: languages, then detected tools, then topics, capped', () => {
  const r = repo({ language: 'Go', topics: ['music', 'sqlite'] });
  assert.deepEqual(techTags(r, { Go: 900, Svelte: 200 }, null, ['SQLite', 'Svelte']), ['Go', 'Svelte', 'SQLite', 'music']);
  assert.equal(techTags(repo({ topics: Array.from({ length: 20 }, (_, i) => `t${i}`) }), { Python: 1 }).length, MAX_TAGS);
});

test('techTags hides minor languages unless they are all there is', () => {
  assert.deepEqual(techTags(repo({ language: 'Python' }), { Python: 500, HTML: 400, Shell: 100 }), ['Python']);
  assert.deepEqual(techTags(repo({ language: 'HTML' }), { HTML: 500, CSS: 400 }), ['HTML', 'CSS']);
  assert.deepEqual(techTags(repo({ language: 'HTML' }), { HTML: 500, CSS: 400 }, null, ['Leaflet']), ['Leaflet']);
});

test('techTags falls back to the repo language and honors a manual list', () => {
  assert.deepEqual(techTags(repo({ language: 'Python' }), null), ['Python']);
  assert.deepEqual(techTags(repo({ language: null }), {}), []);
  assert.deepEqual(techTags(repo(), { Python: 1 }, { tech: ['Go', 'go', 'SQLite'] }, ['React']), ['Go', 'SQLite']);
});

test('descriptions: projects.json wins, per language, with GitHub text as fallback', () => {
  const r = repo({ description: 'Texto en español' });
  assert.deepEqual(descriptions(r, null), { es: 'Texto en español', en: 'Texto en español' });
  assert.deepEqual(descriptions(r, { description: { en: 'English text' } }), { es: 'Texto en español', en: 'English text' });
  assert.deepEqual(descriptions(r, { description: 'Same' }), { es: 'Same', en: 'Same' });
  assert.deepEqual(descriptions(repo({ description: null }), null), { es: '', en: '' });
});

test('describe picks the language, falls back, and accepts plain strings', () => {
  assert.equal(describe({ description: { es: 'hola', en: 'hi' } }, 'en'), 'hi');
  assert.equal(describe({ description: { es: 'hola', en: '' } }, 'en'), 'hola');
  assert.equal(describe({ description: 'plain' }, 'en'), 'plain');
  assert.equal(describe({}, 'es'), '');
});

test('toCard keeps only rendered fields', () => {
  const c = toCard(repo({ owner: { secret: 1 } }), { languages: { Python: 10 }, detected: ['FastAPI'] });
  assert.deepEqual(Object.keys(c).sort(), ['description', 'live', 'name', 'stars', 'tags', 'updated', 'url']);
  assert.deepEqual(c.tags, ['Python', 'FastAPI']);
});

test('sortCards by update (default), name or stars, without mutating', () => {
  const cards = [
    { name: 'beta', stars: 2, updated: '2020-01-01' },
    { name: 'Alpha', stars: 0, updated: '2026-01-01' },
    { name: 'gamma', stars: 2, updated: '2024-01-01' },
    { name: 'delta', stars: 9, updated: null },
  ];
  const names = (by) => sortCards(cards, by).map((c) => c.name);
  assert.deepEqual(names(), ['Alpha', 'gamma', 'beta', 'delta']);
  assert.deepEqual(names('updated'), ['Alpha', 'gamma', 'beta', 'delta']);
  assert.deepEqual(names('name'), ['Alpha', 'beta', 'delta', 'gamma']);
  assert.deepEqual(names('stars'), ['delta', 'gamma', 'beta', 'Alpha']);
  assert.deepEqual(names('bogus'), names('updated'));
  assert.equal(cards[0].name, 'beta');
});

test('sortCards name order ignores accents and orders numbers naturally', () => {
  const names = sortCards([{ name: 'repo10' }, { name: 'Árbol' }, { name: 'repo2' }, { name: 'zeta' }], 'name').map((c) => c.name);
  assert.deepEqual(names, ['Árbol', 'repo2', 'repo10', 'zeta']);
});

test('filterCards searches names, both descriptions and tags; can require a page', () => {
  const cards = prepare([
    repo({ name: 'mapa-cultural', description: 'Agenda de eventos en Gualeguaychú', has_pages: true }),
    repo({ name: 'scraper', description: 'Raspador', language: 'Go', topics: ['data'] }),
    repo({ name: 'forked', fork: true }),
  ], {
    overrides: { scraper: { description: { en: 'Scraping tool' } } },
    detected: { 'mapa-cultural': ['Leaflet'] },
  });
  assert.equal(cards.length, 2);
  assert.deepEqual(filterCards(cards, { query: 'GUALEGUAYCHU' }).map((c) => c.name), ['mapa-cultural']);
  assert.deepEqual(filterCards(cards, { query: 'scraping' }).map((c) => c.name), ['scraper']);
  assert.deepEqual(filterCards(cards, { query: 'leaflet' }).map((c) => c.name), ['mapa-cultural']);
  assert.deepEqual(filterCards(cards, { query: '  go   data ' }).map((c) => c.name), ['scraper']);
  assert.deepEqual(filterCards(cards, { query: 'go cultural' }), []);
  assert.deepEqual(filterCards(cards, { onlyLive: true }).map((c) => c.name), ['mapa-cultural']);
});

test('normalize strips accents', () => {
  assert.equal(normalize('Martín Ñandú'), 'martin nandu');
});

test('formatMonth localizes and tolerates bad input', () => {
  assert.equal(formatMonth('2026-10-15T00:00:00Z', 'en'), 'Oct 2026');
  assert.match(formatMonth('2026-10-15T00:00:00Z', 'es'), /^oct 2026$/i);
  assert.equal(formatMonth('nope', 'en'), '');
  assert.equal(formatMonth(null, 'en'), '');
});

test('pickLanguage: saved choice, then browser, then Spanish', () => {
  assert.equal(pickLanguage('en', ['es-AR']), 'en');
  assert.equal(pickLanguage(null, ['fr-FR', 'en-US']), 'en');
  assert.equal(pickLanguage(null, ['es-AR']), 'es');
  assert.equal(pickLanguage('xx', ['de']), 'es');
});
