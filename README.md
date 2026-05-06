# heartbeat365

Static activity dashboard for tracked OpenSats-funded bitcoin and nostr
repositories.

heartbeat365 renders commits, pull requests, issues, and releases as a
`git log --oneline`-style timeline. This fork is configured with a
365-day data window for annual research and impact-report workflows.

Live site:

https://arvin21m.github.io/heartbeat365/

Live dataset:

https://arvin21m.github.io/heartbeat365/data/events.json

Filter tool:

https://arvin21m.github.io/heartbeat365/filter.html

This is a fork of [OpenSats/heartbeat](https://github.com/OpenSats/heartbeat),
extended for longer research windows, paginated GitHub GraphQL fetching,
GitHub Pages deployment, strict author filtering, virtualized rendering,
browser-side JSON filtering, and monthly repo health checks.

## How it works

A build-time script fetches GitHub activity through the GitHub GraphQL API
and writes:

```text
public/data/events.json
```

The browser loads that static JSON file. Visitors do not call the GitHub API
directly, so normal site usage does not consume GitHub API rate limit.

The dataset includes these event types:

- `commit`
- `pr_opened`
- `pr_merged`
- `pr_closed`
- `issue_opened`
- `issue_closed`
- `release`

Each event includes:

```ts
{
  id: string
  repo: string
  type: EventType
  timestamp: string
  actor: string
  title: string
  url: string
  shortId: string
}
```

The full dataset shape is defined in `src/types.ts`.

## Data

The deployed site publishes the full dataset alongside the app:

```text
/data/events.json
```

Current deployed behavior:

- The GitHub Pages workflow fetches a 365-day dataset.
- The workflow refreshes every 6 hours.
- Each refresh overwrites the published `events.json`.
- The published site is static.
- The browser only reads the generated JSON file.

If you need durable historical snapshots, archive downloaded JSON files
separately. The live `events.json` file is not a historical archive.

## Main dashboard filters

All dashboard filters run client-side on the already-loaded dataset.
Most filters serialize to the URL, so filtered views can be shared.

### Window filter

- UI: `30d / 60d / 90d / 180d / 365d` chips
- URL param: `?window=N`
- Match behavior: shows events from the last `N` days, limited by the
  built dataset

### Fund filter

- UI: fund chips
- URL param: `?funds=...`
- Match behavior: repos in the selected fund bucket

### Repo search

- UI: `filter:` text input
- URL param: `?q=...`
- Match behavior: substring match across repo paths

### Repo selection

- UI: repo chips
- URL param: `?repos=...`
- Match behavior: exact repo match

### Author filter

- UI: `author:` text input
- URL param: `?author=...`
- Match behavior: exact GitHub username match against the event actor

### Event type filter

- UI: event-type chips
- URL param: `?types=...`
- Match behavior: commit, pull request, issue, and release event subsets

### Developer chip filter

- UI: clicking a username in the timeline
- URL param: `?devs=...`
- Match behavior: exact event actor selected from the UI

Notes:

- `?q=` is repo-name search only. It does not search authors or event text.
- `?author=` is the strict author filter.
- Use `?author=` when preparing single-developer or single-grantee research.
- Fund names come from the `repos*.yml` files at the project root.
- Window chips larger than the built dataset may be disabled in the UI.
- A 365-day view requires the dataset to be fetched with at least
  `HEARTBEAT_WINDOW_DAYS=365`.

## Standalone JSON filter tool

The standalone filter tool is available at:

```text
/filter.html
```

It is useful when the full `events.json` file is too large for analysis,
archiving, or uploading elsewhere.

The filter tool loads the latest deployed `data/events.json` and lets you
filter by:

- fund
- time window
- event types
- exact repo names, one per line
- developer usernames, one per line

The filter tool supports these time windows:

- `30d`
- `60d`
- `90d`
- `180d`
- `365d`
- `all`

The filter tool defaults to `90d`. Choose `365d` or `all` if you want the
full annual dataset.

The preview shows:

- events kept
- repos kept
- developers kept
- date range
- estimated download size

The download button creates a local file named like:

```text
events-filtered-YYYY-MM-DD-HH-MM.json
```

The filtered export keeps the same core event data shape and also adds
filter metadata:

```ts
{
  generatedAt: string
  filteredAt: string
  windowDays: number | null
  filters: {
    fund: string | null
    repos: string[]
    devs: string[]
    types: string[]
  }
  repos: string[]
  funds: Record<string, string[]>
  events: Event[]
}
```

All filtering happens locally in the browser. Nothing is uploaded anywhere.

## Develop

Requires Node 22+.

```bash
npm install

export GITHUB_TOKEN=ghp_yourtoken
export HEARTBEAT_WINDOW_DAYS=365

npm run fetch
npm run dev
```

`GITHUB_TOKEN` or `GH_TOKEN` is required for the fetch step.

For public repositories, a GitHub token with access to public repo data is
enough. If you omit `HEARTBEAT_WINDOW_DAYS`, the fetch script uses the
upstream-compatible default of `90`.

To generate the deployed-style annual dataset locally, keep:

```bash
export HEARTBEAT_WINDOW_DAYS=365
```

## Scripts

- `npm run dev`
  - Start the Vite dev server.

- `npm run fetch`
  - Fetch GitHub activity and write `public/data/events.json`.

- `npm run build`
  - Type-check and build the static site.

- `npm run preview`
  - Preview the built site locally.

- `npm run typecheck`
  - Run TypeScript checks without building.

- `npm run lint`
  - Run ESLint.

- `npm run format`
  - Format files with Prettier.

- `npm run format:check`
  - Check formatting.

- `npm run vercel-build`
  - Fetch data and build for Vercel.

## Configure repos

Each `repos*.yml` file at the project root lists tracked repositories.

Example:

```yaml
repos:
  - owner/repo-1
  - owner/repo-2
```

Files are merged and deduplicated during the fetch step.

Fund buckets are determined as follows:

- `repos.general.yml` becomes the `general` fund.
- `repos.nostr.yml` becomes the `nostr` fund.
- `repos.opensats.yml` becomes the `opensats` fund.
- `repos.yml` is also supported and falls back to the `general` fund.
- A file can also define an explicit `fund:` value.

Example with explicit fund name:

```yaml
fund: nostr
repos:
  - owner/repo-1
  - owner/repo-2
```

## Fetch configuration

Environment variables override the fetch defaults.

### GitHub token variables

- `GITHUB_TOKEN`
  - Default: required unless `GH_TOKEN` is set
  - Purpose: GitHub token used by the fetch script

- `GH_TOKEN`
  - Default: optional fallback
  - Purpose: alternative token variable

### Window variable

- `HEARTBEAT_WINDOW_DAYS`
  - Default: `90`
  - Purpose: number of days of history to fetch

### Page-size variables

- `HEARTBEAT_COMMITS_PAGE_SIZE`
  - Default: `100`
  - Purpose: GraphQL page size for commits

- `HEARTBEAT_PRS_PAGE_SIZE`
  - Default: `50`
  - Purpose: GraphQL page size for pull requests

- `HEARTBEAT_ISSUES_PAGE_SIZE`
  - Default: `50`
  - Purpose: GraphQL page size for issues

- `HEARTBEAT_RELEASES_PAGE_SIZE`
  - Default: `20`
  - Purpose: GraphQL page size for releases

### Per-repo cap variables

- `HEARTBEAT_COMMITS_MAX_PER_REPO`
  - Default: `5000`
  - Purpose: hard cap on commits per repo

- `HEARTBEAT_PRS_MAX_PER_REPO`
  - Default: `1000`
  - Purpose: hard cap on pull requests per repo

- `HEARTBEAT_ISSUES_MAX_PER_REPO`
  - Default: `1000`
  - Purpose: hard cap on issues per repo

- `HEARTBEAT_RELEASES_MAX_PER_REPO`
  - Default: `200`
  - Purpose: hard cap on releases per repo

The fetcher paginates each connection until it crosses the selected
time-window cutoff or hits the relevant per-repo cap.

The caps are safety limits. The normal terminator is
`HEARTBEAT_WINDOW_DAYS`.

## Build configuration

Vite uses this base path:

```text
HEARTBEAT_BASE
```

Default:

```text
/
```

The GitHub Pages workflow overrides the build base directly with:

```bash
npx vite build --base=/heartbeat365/
```

For another static host, set the base path to match where the app will be
served.

## Deploy

### GitHub Pages

This fork includes a GitHub Pages workflow at:

```text
.github/workflows/build.yml
```

It runs on:

- push to `master`
- a scheduled cron every 6 hours
- manual workflow dispatch

The workflow:

1. checks out the repo
2. installs Node 22 dependencies
3. runs `npm run fetch`
4. sets `HEARTBEAT_WINDOW_DAYS=365`
5. builds with `npx vite build --base=/heartbeat365/`
6. deploys `dist/` to GitHub Pages

Required repo secret:

```text
HEARTBEAT_PAT
```

Use a GitHub token with access to the tracked repositories.

### Monthly repo health check

This fork includes a monthly repo health-check workflow at:

```text
.github/workflows/repo-health.yml
```

It runs on the 1st of each month and can also be triggered manually from
the Actions tab.

The workflow checks every repository listed in the repo YAML files against
the GitHub API and opens a GitHub Issue if any tracked repos are:

- broken or not found
- renamed or transferred
- archived
- inaccessible to the configured token
- returning other API errors

The workflow uses this repo secret:

```text
HEARTBEAT_PAT
```

If issues are found, it opens a GitHub Issue with the `repo-health` label.
Make sure Issues are enabled on the repository. If the repository requires
labels to exist before use, create the `repo-health` label.

### Vercel

The upstream-style Vercel build script is still available:

```bash
npm run vercel-build
```

That runs:

```bash
npm run fetch && npm run build
```

For Vercel, configure environment variables in the Vercel project settings:

```text
GITHUB_TOKEN
HEARTBEAT_WINDOW_DAYS
```

Set `HEARTBEAT_WINDOW_DAYS=365` if you want an annual dataset. Omit it to
use the fetch script's default `90`.

For scheduled Vercel refreshes, set this repo secret:

```text
VERCEL_DEPLOY_HOOK_URL
```

The included workflow at `.github/workflows/refresh.yml` pings that deploy
hook every 6 hours.

## Static hosting elsewhere

You can also build in CI and serve `dist/` from any static host.

Example:

```yaml
- name: Fetch events
  run: npm run fetch
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    HEARTBEAT_WINDOW_DAYS: '365'

- name: Build
  run: npm run build
```

For subpath hosting, set the Vite base path appropriately.

Example:

```bash
HEARTBEAT_BASE=/heartbeat365/ npm run build
```

Or pass Vite's base flag directly:

```bash
npx vite build --base=/heartbeat365/
```

## Credits

Built on [OpenSats/heartbeat](https://github.com/OpenSats/heartbeat) by the
OpenSats team.

## License

MIT — see [LICENSE](LICENSE).
