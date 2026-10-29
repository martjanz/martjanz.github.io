# martjanz.github.io

Personal page: a short bio (ES/EN) and a live list of my public repositories.

- No build step: plain HTML, CSS and a JS module.
- Repos are fetched from the GitHub API in the visitor's browser (cached for 1 h per session).
  Forks, archived repos and this repo are hidden.
- A repo gets an "Open page" button when its **homepage** field is set, or when GitHub Pages is enabled for it.
  To surface a project deployed elsewhere, just fill in the repo's *Website* field on GitHub.
- The previous blog (2015) lives at [`/blog/`](https://martjanz.github.io/blog/).

Tests (Node 20+): `npm test`
