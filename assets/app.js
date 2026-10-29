import { USER, SORTS, describe, filterCards, sortCards, formatMonth, pickLanguage } from './repos.js';

const TEXT = {
  es: {
    skip: 'Saltar a proyectos',
    bio: 'Hola, soy Martín. Desarrollo software full-stack, entre Gualeguaychú (Entre Ríos) y la Ciudad de Buenos Aires. Hoy trabajo en <a href="https://mapcraft.io">MapCraft</a>, haciendo aplicaciones web basadas en datos, muchas veces con mapas. Abajo, algunas cosas que hice o con las que estuve jugando.',
    repos: 'Proyectos',
    search: 'Buscar',
    onlyLive: 'Solo con página',
    sortLabel: 'Ordenar',
    sort: { updated: 'Recientes', name: 'A–Z', stars: 'Estrellas' },
    live: 'Ver página',
    code: 'Código',
    tech: 'Tecnologías',
    updated: 'Actualizado',
    loading: 'Cargando…',
    empty: 'No hay proyectos que coincidan.',
    error: 'No se pudo cargar la lista.',
    errorLink: 'Ver en GitHub',
    count: (n, total) => (n === total ? `${total} repositorios` : `${n} de ${total}`),
    switchTo: 'EN',
    switchLabel: 'Switch to English',
  },
  en: {
    skip: 'Skip to projects',
    bio: 'Hi, I’m Martín. I’m a full-stack developer splitting my time between Gualeguaychú (Entre Ríos) and Buenos Aires City. I currently work at <a href="https://mapcraft.io">MapCraft</a>, building data-driven web apps, often with maps. Below are some things I’ve built or tinkered with.',
    repos: 'Projects',
    search: 'Search',
    onlyLive: 'Only with a page',
    sortLabel: 'Sort',
    sort: { updated: 'Recent', name: 'A–Z', stars: 'Stars' },
    live: 'Open page',
    code: 'Code',
    tech: 'Technologies',
    updated: 'Updated',
    loading: 'Loading…',
    empty: 'No projects match.',
    error: 'Couldn’t load the list.',
    errorLink: 'See them on GitHub',
    count: (n, total) => (n === total ? `${total} repositories` : `${n} of ${total}`),
    switchTo: 'ES',
    switchLabel: 'Cambiar a español',
  },
};

const state = { lang: 'es', cards: null, error: false, query: '', onlyLive: false, sort: 'updated' };
const $ = (sel) => document.querySelector(sel);

const saved = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* unavailable */ } },
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (child == null || child === false || child === '') continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function renderItem(card, t) {
  const meta = [
    card.stars > 0 ? `★ ${card.stars}` : null,
    card.updated ? `${t.updated} ${formatMonth(card.updated, state.lang)}` : null,
  ].filter(Boolean);
  const tags = card.tags || (card.language ? [card.language] : []);
  const desc = describe(card, state.lang);
  return el('li', { class: card.live ? 'item live' : 'item' },
    el('div', { class: 'item-main' },
      el('h3', {}, el('a', { href: card.live || card.url }, card.name)),
      desc && el('p', { class: 'desc' }, desc),
      tags.length > 0 && el('ul', { class: 'tags', 'aria-label': t.tech }, ...tags.map((tag) => el('li', {}, tag))),
      meta.length > 0 && el('p', { class: 'meta' }, meta.join(' · ')),
    ),
    el('div', { class: 'item-links' },
      card.live && el('a', { class: 'live-link', href: card.live }, `${t.live} →`),
      el('a', { class: 'code-link', href: card.url, 'aria-label': `${t.code}: ${card.name}` }, t.code),
    ),
  );
}

function renderList() {
  const t = TEXT[state.lang];
  const list = $('#repo-list');
  const status = $('#repo-status');
  list.replaceChildren();

  if (state.error) {
    status.replaceChildren(`${t.error} `, el('a', { href: `https://github.com/${USER}?tab=repositories` }, t.errorLink));
    return;
  }
  if (!state.cards) { status.textContent = t.loading; return; }

  const shown = sortCards(filterCards(state.cards, state), state.sort);
  status.textContent = shown.length ? t.count(shown.length, state.cards.length) : t.empty;
  list.append(...shown.map((c) => renderItem(c, t)));
}

function renderText() {
  const t = TEXT[state.lang];
  document.documentElement.lang = state.lang;
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t[node.dataset.i18n];
  $('#bio').innerHTML = t.bio; // static, trusted strings defined above
  $('#search').placeholder = t.search;
  const toggle = $('#lang-toggle');
  toggle.textContent = t.switchTo;
  toggle.setAttribute('aria-label', t.switchLabel);
  const select = $('#sort');
  select.replaceChildren(...SORTS.map((key) => el('option', { value: key }, t.sort[key])));
  select.value = state.sort;
  renderList();
}

async function init() {
  state.lang = pickLanguage(saved.get('lang'), navigator.languages || [navigator.language]);
  const savedSort = saved.get('sort');
  if (SORTS.includes(savedSort)) state.sort = savedSort;
  renderText();

  $('#lang-toggle').addEventListener('click', () => {
    state.lang = state.lang === 'es' ? 'en' : 'es';
    saved.set('lang', state.lang);
    renderText();
  });
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; renderList(); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; saved.set('sort', state.sort); renderList(); });
  $('#only-live').addEventListener('change', (e) => { state.onlyLive = e.target.checked; renderList(); });

  try {
    const res = await fetch('repos.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`repos.json ${res.status}`);
    state.cards = (await res.json()).repos;
  } catch (err) {
    console.error(err);
    state.error = true;
  }
  renderList();
}

init();
