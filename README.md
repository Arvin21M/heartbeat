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

### Vercel (default)

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
default lookback window and paginated fetching.

## License

MIT — see [LICENSE](LICENSE).
