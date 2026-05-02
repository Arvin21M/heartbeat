# heartbeat365

Static activity dashboard for OpenSats-funded bitcoin and nostr repositories.
Renders commits, PRs, issues, and releases from the past 365 days as a
`git log --oneline`-style timeline.

Live at <https://arvin21m.github.io/heartbeat365/>

A GitHub Action fetches data via the GitHub GraphQL API at build time and
writes `public/data/events.json`. The browser never talks to GitHub directly,
so visitors don't burn any rate-limit budget.

This is a fork of [OpenSats/heartbeat](https://github.com/OpenSats/heartbeat)
extended to support a configurable lookback window (default 365 days here vs.
90 upstream) with paginated GraphQL queries so longer windows don't silently
drop events. See the [Knobs](#knobs-env-vars) section for full config.

## Data

The full dataset is published alongside the site:

- **Live JSON:** <https://arvin21m.github.io/heartbeat365/data/events.json>
- **Refresh cadence:** every 6 hours via scheduled GitHub Actions run.
- **Format:** see [`src/types.ts`](./src/types.ts) for the `Dataset` schema.
- **Historical snapshots:** none. Each refresh overwrites the previous file.
  Past datasets can still be downloaded as build artifacts from old runs in
  the [Actions tab](https://github.com/Arvin21M/heartbeat365/actions) for
  ~90 days after each run.

## Filters

All filters work client-side on the already-loaded dataset and serialize to
the URL so views are shareable.

| Filter | UI | URL param | Match |
| --- | --- | --- | --- |
| Window | `30d / 60d / 90d / 180d / 365d` chips | `?window=N` | last *N* days |
| Fund | `general / nostr / ops` chips | `?funds=...` | repos in that fund bucket |
| Repo name | `filter:` text input | `?q=...` | substring across repo paths |
| Repo (explicit) | repo chip selection | `?repos=...` | exact repo match |
| Author | `author:` text input | `?author=...` | **exact** GitHub username (event actor) |
| Event type | `types:` chips | `?types=...` | commit / PR / issue / release subset |
| Dev (chip) | repo-row chip click | `?devs=...` | exact (auto-set when you click a name) |

`?q=` is the substring search used since upstream — useful for "find any repo
or person mentioning X." `?author=` is the strict mode added in this fork —
useful for single-grantee impact reports where you want only that developer's
events and nothing they happened to be cc'd in.

## Develop

Requires Node 22+.

```
npm install
export GITHUB_TOKEN=ghp_yourtoken   # any PAT; no scopes needed for public repos
npm run fetch                       # writes public/data/events.json
npm run dev
```

## Configure

Each `repos*.yml` file at the project root lists tracked repos; all matching
files are merged and deduplicated.

```
repos:
  - owner/repo-1
  - owner/repo-2
```

### Knobs (env vars)

All defaults match the original upstream behavior. Override at fetch time to
change the data the build produces.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HEARTBEAT_WINDOW_DAYS` | `90` | How many days of history to include. This fork is deployed with `365` to enable annual lookback. |
| `HEARTBEAT_COMMITS_PAGE_SIZE` | `100` | GraphQL page size for commits. |
| `HEARTBEAT_PRS_PAGE_SIZE` | `50` | GraphQL page size for pull requests. |
| `HEARTBEAT_ISSUES_PAGE_SIZE` | `50` | GraphQL page size for issues. |
| `HEARTBEAT_RELEASES_PAGE_SIZE` | `20` | GraphQL page size for releases. |
| `HEARTBEAT_COMMITS_MAX_PER_REPO` | `5000` | Hard cap on total commits per repo (safety net). |
| `HEARTBEAT_PRS_MAX_PER_REPO` | `1000` | Hard cap on total PRs per repo. |
| `HEARTBEAT_ISSUES_MAX_PER_REPO` | `1000` | Hard cap on total issues per repo. |
| `HEARTBEAT_RELEASES_MAX_PER_REPO` | `200` | Hard cap on total releases per repo. |

The fetcher paginates each connection until it crosses the window cutoff or
hits the per-repo max — whichever comes first. The maxes exist only as a
runaway-protection budget; the real terminator is `HEARTBEAT_WINDOW_DAYS`.

## Deploy

### GitHub Pages (this fork)

[`build.yml`](./.github/workflows/build.yml) runs `npm run fetch` then
`vite build`, then deploys `dist/` to GitHub Pages. Triggers:

- every push to `master`
- every 6 hours via cron
- manually via the **Run workflow** button on the Actions tab

Required repo secret: `HEARTBEAT_PAT` — a fine-grained PAT with
public-repo read access. Token lifetime must be ≤366 days for orgs that
restrict long-lived tokens (e.g. OpenSats).

### Vercel (upstream default)

`vercel-build` runs `npm run fetch && npm run build`. Set the following in
**Vercel → Project → Settings → Environment Variables**, scoped to all
environments:

* `GITHUB_TOKEN` — any GitHub PAT; no scopes needed for public repos.
* `HEARTBEAT_WINDOW_DAYS` *(optional)* — e.g. `365` for an annual window.
  Omit to keep the 90-day default.

For periodic refreshes, save a Vercel Deploy Hook URL as the
`VERCEL_DEPLOY_HOOK_URL` repo secret and the included
[`refresh.yml`](https://github.com/Arvin21M/heartbeat365/blob/master/.github/workflows/refresh.yml)
workflow pings it every 6 hours.

### GitHub Actions / Pages / static host

If you'd rather build the dataset in CI and serve the static output from
anywhere (Pages, Cloudflare Pages, S3, a VPS), run the fetch in a workflow:

```
- name: Fetch events
  run: npm run fetch
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    HEARTBEAT_WINDOW_DAYS: '365'
- name: Build
  run: npm run build
```

The built site is the contents of `dist/` and `public/data/events.json` is
embedded at fetch time.

## Credits

Built on [OpenSats/heartbeat](https://github.com/OpenSats/heartbeat) by
the OpenSats team. This fork extends the upstream project with a longer
default lookback window, paginated fetching, virtualized rendering, a
window selector, and a strict author filter — optimized for annual
impact-report research.

## License

MIT — see [LICENSE](LICENSE).
