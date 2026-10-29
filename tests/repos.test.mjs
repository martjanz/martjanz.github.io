import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  safeUrl, liveUrl, isListed, toCard, sortCards, filterCards, prepare, formatMonth, pickLanguage, normalize,
} from '../assets/repos.js';

const repo = (over = {}) => ({
  name: 'demo', fork: false, archived: false, has_pages: false, homepage: null,
  description: 'A demo', html_url: 'https://github.com/martjanz/demo', language: 'Python',
  stargazers_count: 0, pushed_at: '2025-01-01T00:00:00Z', topics: [], ...over,
});

test('safeUrl accepts http(s), adds https to bare domains, rejects others', () => {
  assert.equal(safeUrl('https://a.com/x'), 'https://a.com/x');
  assert.equal(safeUrl('a.com'), 'https://a.com/');
  assert.equal(safeUrl('  '), null);
  assert.equal(safeUrl(null), null);
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('ftp://a.com'), null);
});

test('liveUrl prefers homepage, then GitHub Pages, else null', () => {
  assert.equal(liveUrl(repo({ homepage: 'https://site.dev', has_pages: true })), 'https://site.dev/');
  assert.equal(liveUrl(repo({ has_pages: true, name: 'campomap' })), 'https://martjanz.github.io/campomap/');
  assert.equal(liveUrl(repo({ homepage: '' })), null);
});

test('isListed hides forks, archived repos and the site repo itself', () => {
  assert.equal(isListed(repo()), true);
  assert.equal(isListed(repo({ fork: true })), false);
  assert.equal(isListed(repo({ archived: true })), false);
  assert.equal(isListed(repo({ name: 'martjanz.github.io' })), false);
});

test('toCard fills safe defaults', () => {
  const c = toCard(repo({ description: null, language: null, topics: undefined }));
  assert.deepEqual([c.description, c.language, c.topics, c.live], ['', null, [], null]);
});

test('sortCards puts live repos first, then newest', () => {
  const cards = [
    { name: 'old', live: null, updated: '2020-01-01' },
    { name: 'new', live: null, updated: '2026-01-01' },
    { name: 'liveOld', live: 'https://x', updated: '2019-01-01' },
  ];
  assert.deepEqual(sortCards(cards).map((c) => c.name), ['liveOld', 'new', 'old']);
  assert.equal(cards[0].name, 'old', 'does not mutate input');
});

test('filterCards matches all words, ignores case/accents, and can require a live page', () => {
  const cards = prepare([
    repo({ name: 'mapa-cultural', description: 'Agenda de eventos en Gualeguaychú', has_pages: true }),
    repo({ name: 'scraper', description: 'Scraping tool', language: 'Go', topics: ['data'] }),
  ]);
  assert.deepEqual(filterCards(cards, { query: 'GUALEGUAYCHU' }).map((c) => c.name), ['mapa-cultural']);
  assert.deepEqual(filterCards(cards, { query: 'go data' }).map((c) => c.name), ['scraper']);
  assert.deepEqual(filterCards(cards, { query: 'go cultural' }), []);
  assert.deepEqual(filterCards(cards, { onlyLive: true }).map((c) => c.name), ['mapa-cultural']);
  assert.equal(filterCards(cards).length, 2);
});

test('normalize strips accents', () => {
  assert.equal(normalize('Martín Ñandú'), 'martin nandu');
});

test('formatMonth localizes and tolerates bad input', () => {
  assert.match(formatMonth('2026-10-15T00:00:00Z', 'en'), /Oct 2026/);
  assert.match(formatMonth('2026-10-15T00:00:00Z', 'es'), /oct.*2026/i);
  assert.equal(formatMonth('nope', 'en'), '');
});

test('pickLanguage: saved choice, then browser, then Spanish', () => {
  assert.equal(pickLanguage('en', ['es-AR']), 'en');
  assert.equal(pickLanguage(null, ['fr-FR', 'en-US']), 'en');
  assert.equal(pickLanguage(null, ['es-AR']), 'es');
  assert.equal(pickLanguage('xx', ['de']), 'es');
});
