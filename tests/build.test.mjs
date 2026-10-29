import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchAllRepos, build } from '../scripts/build.mjs';
import { repo } from './helpers.mjs';

const okResponse = (data) => ({ ok: true, status: 200, json: async () => data });

function fakeFetch(pages) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    const page = Number(new URL(url).searchParams.get('page'));
    return okResponse(pages[page - 1] || []);
  };
  return { impl, calls };
}

test('fetchAllRepos follows pagination and sends the token', async () => {
  const full = Array.from({ length: 100 }, (_, i) => repo({ name: `r${i}` }));
  const { impl, calls } = fakeFetch([full, [repo({ name: 'last' })]]);
  const all = await fetchAllRepos({ fetchImpl: impl, token: 'abc' });
  assert.equal(all.length, 101);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /users\/martjanz\/repos\?type=owner&per_page=100&page=1/);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer abc');
});

test('fetchAllRepos omits auth without a token and fails loudly on API errors', async () => {
  const { impl, calls } = fakeFetch([[]]);
  await fetchAllRepos({ fetchImpl: impl });
  assert.equal(calls[0].opts.headers.Authorization, undefined);
  await assert.rejects(
    fetchAllRepos({ fetchImpl: async () => ({ ok: false, status: 403 }) }),
    /GitHub API 403/,
  );
});

test('build copies site files only and writes prepared repos.json', async () => {
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

    const out = join(root, '_site');
    const { impl } = fakeFetch([[
      repo({ name: 'campomap', has_pages: true }),
      repo({ name: 'old-fork', fork: true }),
      repo({ name: 'martjanz.github.io', has_pages: true }),
    ]]);
    const repos = await build({ root, out, fetchImpl: impl, now: new Date('2026-10-29T00:00:00Z') });

    assert.deepEqual(repos.map((r) => r.name), ['campomap']);
    assert.ok(existsSync(join(out, 'index.html')));
    assert.ok(existsSync(join(out, 'assets', 'app.js')));
    assert.ok(existsSync(join(out, 'campomap', 'index.html')));
    assert.ok(!existsSync(join(out, 'campomap', '.git')));
    for (const junk of ['scripts', 'tests', '.github', 'package.json', 'README.md', '_site']) {
      assert.ok(!existsSync(join(out, junk)), `${junk} should not be published`);
    }
    const data = JSON.parse(readFileSync(join(out, 'repos.json'), 'utf8'));
    assert.equal(data.generated, '2026-10-29T00:00:00.000Z');
    assert.equal(data.repos[0].live, 'https://martjanz.github.io/campomap/');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
