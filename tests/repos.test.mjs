import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  liveUrl, isListed, toCard, sortCards, filterCards, prepare, formatMonth, pickLanguage, normalize,
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

test('toCard keeps only rendered fields, with safe defaults', () => {
  const c = toCard(repo({ description: null, language: null, topics: undefined, owner: { secret: 1 } }));
  assert.deepEqual(Object.keys(c).sort(), ['description', 'language', 'live', 'name', 'stars', 'topics', 'updated', 'url']);
  assert.deepEqual([c.description, c.language, c.topics, c.live], ['', null, [], null]);
});

test('sortCards puts live repos first, then newest, without mutating', () => {
  const cards = [
    { name: 'old', live: null, updated: '2020-01-01' },
    { name: 'new', live: null, updated: '2026-01-01' },
    { name: 'liveOld', live: 'https://x', updated: '2019-01-01' },
    { name: 'noDate', live: null, updated: null },
  ];
  assert.deepEqual(sortCards(cards).map((c) => c.name), ['liveOld', 'new', 'old', 'noDate']);
  assert.equal(cards[0].name, 'old');
});

test('filterCards matches all words, ignores case/accents, and can require a page', () => {
  const cards = prepare([
    repo({ name: 'mapa-cultural', description: 'Agenda de eventos en Gualeguaychú', has_pages: true }),
    repo({ name: 'scraper', description: 'Scraping tool', language: 'Go', topics: ['data'] }),
    repo({ name: 'forked', fork: true }),
  ]);
  assert.equal(cards.length, 2);
  assert.deepEqual(filterCards(cards, { query: 'GUALEGUAYCHU' }).map((c) => c.name), ['mapa-cultural']);
  assert.deepEqual(filterCards(cards, { query: '  go   data ' }).map((c) => c.name), ['scraper']);
  assert.deepEqual(filterCards(cards, { query: 'go cultural' }), []);
  assert.deepEqual(filterCards(cards, { onlyLive: true }).map((c) => c.name), ['mapa-cultural']);
  assert.equal(filterCards(cards).length, 2);
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
