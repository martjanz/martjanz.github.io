import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchAllRepos, fetchLanguages, fetchDetected, build } from '../scripts/build.mjs';
import { repo } from './helpers.mjs';

const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
const text = (body) => ({ ok: true, status: 200, text: async () => body });
const notFound = () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' });

/**
 * Fake GitHub API. api = {
 *   pages: [[repo...], ...],
 *   languages: { name: {...} | 'fail' },
 *   trees: { name: [paths] | 409 },
 *   files: { 'name/path': text },
 * }
 */
function fakeApi(api) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    const u = new URL(url);
    let m;
    if (u.pathname === '/users/martjanz/repos') return json(api.pages[Number(u.searchParams.get('page')) - 1] || []);
    if ((m = u.pathname.match(/^\/repos\/martjanz\/([^/]+)\/languages$/))) {
      const l = api.languages?.[decodeURIComponent(m[1])];
      return l === 'fail' ? json({}, 500) : json(l || {});
    }
    if ((m = u.pathname.match(/^\/repos\/martjanz\/([^/]+)\/git\/trees\//))) {
      const t = api.trees?.[decodeURIComponent(m[1])];
      if (t === 409) return json({}, 409);
      return json({ tree: (t || []).map((path) => ({ path, type: 'blob' })) });
    }
    if ((m = u.pathname.match(/^\/repos\/martjanz\/([^/]+)\/contents\/(.+)$/))) {
      const key = `${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}`;
      return key in (api.files || {}) ? text(api.files[key]) : notFound();
    }
    throw new Error(`unexpected URL ${url}`);
  };
  return { impl, calls };
}

test('fetchAllRepos follows pagination and sends the token', async () => {
  const full = Array.from({ length: 100 }, (_, i) => repo({ name: `r${i}` }));
  const { impl, calls } = fakeApi({ pages: [full, [repo({ name: 'last' })]] });
  const all = await fetchAllRepos({ fetchImpl: impl, token: 'abc' });
  assert.equal(all.length, 101);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /users\/martjanz\/repos\?type=owner&per_page=100&page=1/);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer abc');
});

test('fetchAllRepos omits auth without a token and fails loudly on API errors', async () => {
  const { impl, calls } = fakeApi({ pages: [[]] });
  await fetchAllRepos({ fetchImpl: impl });
  assert.equal(calls[0].opts.headers.Authorization, undefined);
  await assert.rejects(fetchAllRepos({ fetchImpl: async () => json({}, 403) }), /GitHub API 403/);
});

test('fetchLanguages tolerates per-repo failures with a warning', async () => {
  const warnings = [];
  const { impl } = fakeApi({ languages: { a: { Go: 10 }, b: 'fail' } });
  const result = await fetchLanguages([repo({ name: 'a' }), repo({ name: 'b' })], { fetchImpl: impl, warn: (w) => warnings.push(w) });
  assert.deepEqual(result, { a: { Go: 10 } });
  assert.match(warnings[0], /languages for b: HTTP 500/);
});

test('fetchDetected reads manifests as raw text and skips empty repos', async () => {
  const { impl, calls } = fakeApi({
    trees: { app: ['README.md', 'requirements.txt', 'web/package.json', 'node_modules/x/package.json'], empty: 409 },
    files: { 'app/requirements.txt': 'fastapi\n', 'app/web/package.json': '{"dependencies":{"react":"18"}}' },
  });
  const warnings = [];
  const result = await fetchDetected(
    [repo({ name: 'app', default_branch: 'main' }), repo({ name: 'empty' })],
    { fetchImpl: impl, warn: (w) => warnings.push(w) },
  );
  assert.deepEqual(result, { app: ['FastAPI', 'React'] });
  assert.deepEqual(warnings, []);
  const contentCalls = calls.filter((c) => c.url.includes('/contents/'));
  assert.equal(contentCalls.length, 2);
  assert.equal(contentCalls[0].opts.headers.Accept, 'application/vnd.github.raw');
  assert.match(calls.find((c) => c.url.includes('/git/trees/')).url, /trees\/main\?recursive=1/);
});

test('build copies site files only and writes repos.json with tags and bilingual descriptions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'site-'));
  try {
    writeFileSync(join(root, 'index.html'), '<h1>hi</h1>');
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'assets', 'app.js'), '');
    mkdirSync(join(root, 'campomap'));
    writeFileSync(join(root, 'campomap', 'index.html'), 'map');
    writeFileSync(join(root, 'campomap', '.git'), 'gitdir: ../.git/modules/campomap'); // submodule pointer
    for (const junk of ['scripts', 'tests', '.github']) mkdirSync(join(root, junk));
    writeFileSync(join(root, 'package.json'), '{}');
    writeFileSync(join(root, 'README.md'), '');
    writeFileSync(join(root, 'projects.json'), JSON.stringify({
      $comment: 'ignored',
      tordo: { description: { es: 'Reproductor', en: 'Player' } },
      ghost: { description: 'not a repo' },
    }));

    const out = join(root, '_site');
    const { impl } = fakeApi({
      pages: [[
        repo({ name: 'campomap', has_pages: true, language: 'JavaScript', description: 'Mapa' }),
        repo({ name: 'tordo', language: 'Go', description: 'Reproductor de música' }),
        repo({ name: 'old-fork', fork: true }),
        repo({ name: 'martjanz.github.io', has_pages: true }),
      ]],
      languages: { campomap: { JavaScript: 100, HTML: 50 }, tordo: { Go: 800, Svelte: 200 } },
      trees: { campomap: ['index.html'], tordo: ['go.mod', 'web/package.json'] },
      files: {
        'tordo/go.mod': 'module tordo\nrequire modernc.org/sqlite v1.0.0',
        'tordo/web/package.json': '{"devDependencies":{"svelte":"5"}}',
      },
    });
    const warnings = [];
    const repos = await build({ root, out, fetchImpl: impl, now: new Date('2026-10-29T00:00:00Z'), warn: (w) => warnings.push(w) });

    assert.deepEqual(repos.map((r) => r.name), ['campomap', 'tordo']);
    assert.deepEqual(repos[0].tags, ['JavaScript']);
    assert.deepEqual(repos[1].tags, ['Go', 'Svelte', 'SQLite']);
    assert.deepEqual(repos[1].description, { es: 'Reproductor', en: 'Player' });
    assert.deepEqual(repos[0].description, { es: 'Mapa', en: 'Mapa' });
    assert.deepEqual(warnings, ['projects.json has entries for unknown repos: ghost']);

    assert.ok(existsSync(join(out, 'index.html')));
    assert.ok(existsSync(join(out, 'assets', 'app.js')));
    assert.ok(existsSync(join(out, 'campomap', 'index.html')));
    assert.ok(!existsSync(join(out, 'campomap', '.git')));
    for (const junk of ['scripts', 'tests', '.github', 'package.json', 'README.md', 'projects.json', '_site']) {
      assert.ok(!existsSync(join(out, junk)), `${junk} should not be published`);
    }
    const data = JSON.parse(readFileSync(join(out, 'repos.json'), 'utf8'));
    assert.equal(data.generated, '2026-10-29T00:00:00.000Z');
    assert.equal(data.repos[0].live, 'https://martjanz.github.io/campomap/');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
