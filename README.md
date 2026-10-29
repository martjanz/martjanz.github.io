# martjanz.github.io

Personal page: a short bio (ES/EN) and a list of my public repositories.

- Plain HTML, CSS and a JS module. No framework, no dependencies.
- **Static build**: `.github/workflows/pages.yml` runs the tests, then `scripts/build.mjs`,
  which fetches my repos from the GitHub API and writes `repos.json` into `_site/`, then deploys it.
  It runs on every push to `master`, daily, and on demand (Actions → *Build and deploy site* → *Run workflow*).
- Forks, archived repos and this repo are hidden.
- **Tech tags** for every repo: main languages (≥10% of the code), then frameworks/tools detected from
  `package.json`, `requirements*.txt`, `pyproject.toml`, `go.mod` and `Dockerfile` (`scripts/tech.mjs`), then GitHub topics.
- **`projects.json`** (optional, per repo): `description: {es, en}` for bilingual descriptions, and `tech: [...]`
  to replace the automatic tags.
- Visitors can search, sort (recent, A–Z, stars) and filter to repos with a page.
- A repo gets an "Open page" link when GitHub Pages is enabled for it.
- `campomap/` is a git submodule served as part of this site.
- Font: Montserrat, self-hosted (SIL Open Font License, `assets/fonts/OFL.txt`).

Requires *Settings → Pages → Source: GitHub Actions*.

```sh
npm test        # unit tests (Node 20+)
npm run serve   # build into _site/ and serve it on http://localhost:8000
```
