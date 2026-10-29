// Detects main frameworks/tools from dependency manifests. Pure functions, no network.

// Dependency name -> tag. Matched exactly against parsed dependency names.
export const JS_DEPS = {
  react: 'React', next: 'Next.js', svelte: 'Svelte', '@sveltejs/kit': 'SvelteKit', vue: 'Vue',
  nuxt: 'Nuxt', '@angular/core': 'Angular', astro: 'Astro', express: 'Express', fastify: 'Fastify',
  electron: 'Electron', leaflet: 'Leaflet', 'maplibre-gl': 'MapLibre', 'mapbox-gl': 'Mapbox',
  ol: 'OpenLayers', '@deck.gl/core': 'deck.gl', 'deck.gl': 'deck.gl', d3: 'D3', three: 'Three.js',
  tailwindcss: 'Tailwind', pg: 'PostgreSQL', sqlite3: 'SQLite', 'better-sqlite3': 'SQLite',
  mongodb: 'MongoDB', mongoose: 'MongoDB', prisma: 'Prisma', '@turf/turf': 'Turf',
};
export const PY_DEPS = {
  fastapi: 'FastAPI', flask: 'Flask', django: 'Django', streamlit: 'Streamlit', pandas: 'pandas',
  geopandas: 'GeoPandas', shapely: 'Shapely', sqlalchemy: 'SQLAlchemy', psycopg: 'PostgreSQL',
  psycopg2: 'PostgreSQL', 'psycopg2-binary': 'PostgreSQL', asyncpg: 'PostgreSQL', scrapy: 'Scrapy',
  beautifulsoup4: 'BeautifulSoup', selenium: 'Selenium', playwright: 'Playwright',
  'scikit-learn': 'scikit-learn', torch: 'PyTorch', tensorflow: 'TensorFlow', folium: 'Folium',
  matplotlib: 'Matplotlib', jupyter: 'Jupyter', dash: 'Dash', 'python-telegram-bot': 'Telegram',
};
export const GO_DEPS = {
  'modernc.org/sqlite': 'SQLite', 'github.com/mattn/go-sqlite3': 'SQLite', 'github.com/jackc/pgx': 'PostgreSQL',
  'github.com/lib/pq': 'PostgreSQL', 'github.com/gin-gonic/gin': 'Gin', 'github.com/labstack/echo': 'Echo',
  'github.com/gofiber/fiber': 'Fiber', 'github.com/go-chi/chi': 'chi',
};

const MANIFEST = /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|go\.mod|Dockerfile)$/;
const SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|\.venv|venv|site-packages|examples?|tests?|fixtures)\//;

/** Manifest paths worth reading from a repo tree, shallowest first, at most `max`. */
export function pickManifests(paths, max = 6) {
  return paths
    .filter((p) => MANIFEST.test(p) && !SKIP_DIR.test(p) && p.split('/').length <= 3)
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
    .slice(0, max);
}

export function jsDeps(text) {
  try {
    const pkg = JSON.parse(text);
    return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies });
  } catch {
    return [];
  }
}

/** Requirement names from requirements.txt or pyproject.toml (PEP 621 and Poetry). */
export function pyDeps(text) {
  const names = [];
  const add = (spec) => {
    const m = String(spec).trim().match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/);
    if (m) names.push(m[1].toLowerCase().replace(/_/g, '-'));
  };
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line || line.startsWith('-')) continue;
    const header = line.match(/^\[(.+)\]$/);
    if (header) { section = header[1]; continue; }
    if (/dependencies/i.test(section) && /^[A-Za-z0-9._-]+\s*=/.test(line)) { add(line); continue; } // poetry
    const quoted = line.match(/["']([^"']+)["']/g);
    if (quoted && (section === 'project' || /dependencies|requires/i.test(section))) {
      quoted.forEach((q) => add(q.slice(1, -1)));
      continue;
    }
    if (!section) add(line); // requirements.txt
  }
  return names;
}

export function goDeps(text) {
  return [...text.matchAll(/^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]+\/[^\s]+)\s+v/gm)].map((m) => m[1]);
}

/** Tags detected from { path: fileText } manifests, in a stable order without duplicates. */
export function detectTech(files) {
  const tags = [];
  const push = (t) => { if (t && !tags.includes(t)) tags.push(t); };
  for (const [path, text] of Object.entries(files)) {
    const name = path.split('/').pop();
    if (name === 'package.json') jsDeps(text).forEach((d) => push(JS_DEPS[d]));
    else if (name === 'go.mod') {
      goDeps(text).forEach((d) => {
        const key = Object.keys(GO_DEPS).find((k) => d === k || d.startsWith(`${k}/`));
        push(GO_DEPS[key]);
      });
    } else if (name === 'Dockerfile') continue;
    else pyDeps(text).forEach((d) => push(PY_DEPS[d]));
  }
  // Docker is packaging, not the stack itself: list it last.
  if (Object.keys(files).some((p) => p.split('/').pop() === 'Dockerfile')) push('Docker');
  return tags;
}
