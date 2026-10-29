import { USER, prepare, filterCards, formatMonth, pickLanguage } from './repos.js';

const TEXT = {
  es: {
    title: 'Martín Anzorena',
    bio: 'Hola, soy Martín. Desarrollo software full-stack, entre Gualeguaychú (Entre Ríos) y la Ciudad de Buenos Aires. Hoy trabajo en <a href="https://mapcraft.io">MapCraft</a>, haciendo aplicaciones web basadas en datos, muchas veces con mapas. Abajo, algunas cosas que hice o con las que estuve jugando.',
    skip: 'Saltar a repositorios',
    repos: 'Repositorios',
    search: 'Buscar',
    searchPlaceholder: 'Buscar (nombre, lenguaje, tema)',
    onlyLive: 'Solo con página',
    live: 'Ver página',
    code: 'Código',
    updated: 'Actualizado',
    loading: 'Cargando repositorios…',
    empty: 'No hay repositorios que coincidan.',
    error: 'No se pudieron cargar los repositorios en este momento.',
    errorLink: 'Verlos en GitHub',
    count: (n, total) => `${n} de ${total}`,
    oldBlog: 'Blog viejo (2015)',
    switchTo: 'English',
    switchLabel: 'Switch to English',
  },
  en: {
    title: 'Martín Anzorena',
    bio: 'Hi, I’m Martín. I’m a full-stack developer splitting my time between Gualeguaychú (Entre Ríos) and Buenos Aires City. I currently work at <a href="https://mapcraft.io">MapCraft</a>, building data-driven web apps, often with maps. Below are some things I’ve built or tinkered with.',
    skip: 'Skip to repositories',
    repos: 'Repositories',
    search: 'Search',
    searchPlaceholder: 'Search (name, language, topic)',
    onlyLive: 'Only with a page',
    live: 'Open page',
    code: 'Code',
    updated: 'Updated',
    loading: 'Loading repositories…',
    empty: 'No repositories match.',
    error: 'Couldn’t load the repositories right now.',
    errorLink: 'See them on GitHub',
    count: (n, total) => `${n} of ${total}`,
    oldBlog: 'Old blog (2015)',
    switchTo: 'Español',
    switchLabel: 'Cambiar a español',
  },
};

const API = `https://api.github.com/users/${USER}/repos?per_page=100&type=owner&sort=pushed`;
const CACHE_KEY = 'repos-cache-v1';
const CACHE_MS = 60 * 60 * 1000;

const store = {
  get(storage, key) {
    try { return window[storage].getItem(key); } catch { return null; }
  },
  set(storage, key, value) {
    try { window[storage].setItem(key, value); } catch { /* storage unavailable */ }
  },
};

const state = { lang: 'es', cards: null, error: false, query: '', onlyLive: false };
const $ = (sel) => document.querySelector(sel);

async function loadRepos() {
  const cached = store.get('sessionStorage', CACHE_KEY);
  if (cached) {
    try {
      const { at, data } = JSON.parse(cached);
      if (Date.now() - at < CACHE_MS) return data;
    } catch { /* ignore bad cache */ }
  }
  const all = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`${API}&page=${page}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < 100) break;
  }
  store.set('sessionStorage', CACHE_KEY, JSON.stringify({ at: Date.now(), data: all }));
  return all;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function renderCard(card, t) {
  const meta = el('p', { class: 'meta' },
    card.language && el('span', { class: 'lang' }, card.language),
    card.stars > 0 && el('span', { 'aria-label': `${card.stars} stars` }, `★ ${card.stars}`),
    card.updated && el('span', {}, `${t.updated} ${formatMonth(card.updated, state.lang)}`),
  );
  const links = el('p', { class: 'links' },
    card.live && el('a', { class: 'btn primary', href: card.live }, `${t.live} ↗`),
    el('a', { class: 'btn', href: card.url }, t.code),
  );
  return el('li', { class: card.live ? 'card has-live' : 'card' },
    el('h3', {}, el('a', { href: card.live || card.url }, card.name)),
    card.description && el('p', { class: 'desc' }, card.description),
    meta,
    links,
  );
}

function renderList() {
  const t = TEXT[state.lang];
  const list = $('#repo-list');
  const status = $('#repo-status');
  list.replaceChildren();

  if (state.error) {
    status.replaceChildren(t.error, ' ', el('a', { href: `https://github.com/${USER}?tab=repositories` }, `${t.errorLink} ↗`));
    return;
  }
  if (!state.cards) { status.textContent = t.loading; return; }

  const shown = filterCards(state.cards, state);
  status.textContent = shown.length ? t.count(shown.length, state.cards.length) : t.empty;
  list.append(...shown.map((c) => renderCard(c, t)));
}

function renderText() {
  const t = TEXT[state.lang];
  document.documentElement.lang = state.lang;
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t[node.dataset.i18n];
  $('#bio').innerHTML = t.bio; // static, trusted strings defined above
  $('#search').placeholder = t.searchPlaceholder;
  const toggle = $('#lang-toggle');
  toggle.textContent = t.switchTo;
  toggle.setAttribute('aria-label', t.switchLabel);
  toggle.setAttribute('lang', state.lang === 'es' ? 'en' : 'es');
  renderList();
}

function init() {
  state.lang = pickLanguage(store.get('localStorage', 'lang'), navigator.languages || [navigator.language]);
  renderText();

  $('#lang-toggle').addEventListener('click', () => {
    state.lang = state.lang === 'es' ? 'en' : 'es';
    store.set('localStorage', 'lang', state.lang);
    renderText();
  });
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; renderList(); });
  $('#only-live').addEventListener('change', (e) => { state.onlyLive = e.target.checked; renderList(); });

  loadRepos()
    .then((data) => { state.cards = prepare(data); })
    .catch((err) => { console.error(err); state.error = true; })
    .finally(renderList);
}

init();
