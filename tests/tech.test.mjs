import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickManifests, jsDeps, pyDeps, goDeps, detectTech } from '../scripts/tech.mjs';

test('pickManifests: shallow manifests first, skips vendored/test dirs, capped', () => {
  const paths = [
    'src/app.js', 'web/package.json', 'package.json', 'node_modules/x/package.json',
    'a/b/c/package.json', 'tests/requirements.txt', 'requirements-dev.txt', 'go.mod', 'docker/Dockerfile',
  ];
  assert.deepEqual(pickManifests(paths), ['go.mod', 'package.json', 'requirements-dev.txt', 'docker/Dockerfile', 'web/package.json']);
  assert.equal(pickManifests(Array.from({ length: 20 }, (_, i) => `p${i}/package.json`)).length, 6);
});

test('jsDeps reads all dependency kinds and survives bad JSON', () => {
  assert.deepEqual(jsDeps('{"dependencies":{"react":"1"},"devDependencies":{"vite":"1"}}').sort(), ['react', 'vite']);
  assert.deepEqual(jsDeps('not json'), []);
  assert.deepEqual(jsDeps('{}'), []);
});

test('pyDeps parses requirements.txt', () => {
  const txt = '# comment\nFastAPI==0.110\nuvicorn[standard]>=0.2\n-r base.txt\npsycopg2_binary\n\ngeopandas ; python_version>"3"';
  assert.deepEqual(pyDeps(txt), ['fastapi', 'uvicorn', 'psycopg2-binary', 'geopandas']);
});

test('pyDeps parses pyproject.toml (PEP 621 and Poetry)', () => {
  const pep621 = '[project]\nname = "x"\ndependencies = [\n  "flask>=3",\n  "pandas",\n]\n[tool.ruff]\nline-length = 100';
  assert.deepEqual(pyDeps(pep621).filter((d) => d !== 'x'), ['flask', 'pandas']);
  const poetry = '[tool.poetry.dependencies]\npython = "^3.12"\ndjango = "^5"\n[tool.black]\nline-length = 88';
  assert.deepEqual(pyDeps(poetry), ['python', 'django']);
});

test('goDeps reads block and single-line requires', () => {
  const mod = 'module x\n\ngo 1.22\n\nrequire github.com/gin-gonic/gin v1.9.0\n\nrequire (\n\tmodernc.org/sqlite v1.59.0 // indirect\n\tgithub.com/jackc/pgx/v5 v5.5.0\n)';
  assert.deepEqual(goDeps(mod), ['github.com/gin-gonic/gin', 'modernc.org/sqlite', 'github.com/jackc/pgx/v5']);
});

test('detectTech maps manifests to tags without duplicates', () => {
  const tags = detectTech({
    'go.mod': 'module x\nrequire (\n\tmodernc.org/sqlite v1.0.0\n\tgithub.com/jackc/pgx/v5 v5.0.0\n)',
    'web/package.json': '{"dependencies":{"svelte":"5","maplibre-gl":"4"},"devDependencies":{"vite":"8"}}',
    'requirements.txt': 'fastapi\npsycopg2',
    Dockerfile: 'FROM python:3.12',
  });
  assert.deepEqual(tags, ['SQLite', 'PostgreSQL', 'Svelte', 'MapLibre', 'FastAPI', 'Docker']);
  assert.deepEqual(detectTech({ Dockerfile: 'FROM x', 'requirements.txt': 'flask' }), ['Flask', 'Docker']);
  assert.deepEqual(detectTech({}), []);
});
