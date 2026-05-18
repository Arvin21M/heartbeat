# heartbeat365

Static activity dashboard for tracked OpenSats-funded bitcoin and nostr repositories.

heartbeat365 renders commits, pull requests / merge requests, issues, releases, and NIP-34 nostr repo activity as a `git log --oneline`-style timeline. This fork is configured with a 365-day data window for annual research and impact-report workflows.

Live site: https://arvin21m.github.io/heartbeat365/  
Live dataset: https://arvin21m.github.io/heartbeat365/data/events.json  
Filter tool: https://arvin21m.github.io/heartbeat365/filter.html

This is a fork of [OpenSats/heartbeat](https://github.com/OpenSats/heartbeat), extended for longer research windows, multi-host fetching, host-aware event identity, GitHub Pages deployment, strict author filtering, virtualized rendering, browser-side JSON filtering, and monthly repo health checks.

## Current capabilities

heartbeat365 currently fetches activity from five provider families:

- **GitHub** — GraphQL provider for bare `owner/name` entries.
- **Codeberg / Forgejo / Gitea** — REST provider for `codeberg:owner/name` and registered self-hosted Forgejo/Gitea instance labels.
- **GitLab.com** — REST v4 provider for `gitlab:group/project` and nested GitLab namespace paths.
- **Plain Git URLs** — commits-only provider for `git:https://...` entries, using shallow clone + `git log`.
- **NIP-34 nostr repos** — nostr provider for `nostr:naddr1...` repo announcements, using `nostr-tools`, relay queries, and signature verification.

Supported event types are:

- `commit`
- `pr_opened`
- `pr_merged`
- `pr_closed`
- `issue_opened`
- `issue_closed`
- `release`

Notes:

- GitHub, Forgejo/Gitea, Codeberg, and GitLab can provide commits, PRs/MRs, issues, and releases where the host API exposes them.
- Plain Git URL entries are commits-only. Git alone does not expose PRs, issues, releases, comments, or reviews.
- NIP-34 nostr entries currently track patch / PR / issue style events and status events. NIP-34 repo state events are not converted into fake commit events; pair a `nostr:naddr1...` entry with a `git:https://...` entry if you want commits for the same repo.
- Mirrors may appear as separate repos if the same project is tracked on multiple hosts. Cross-host mirror deduplication is intentionally not implemented yet.

## How it works

A build-time script reads the `repos*.yml` files, routes each repo entry to the correct provider, fetches activity, normalizes the events into one shared schema, and writes:

```text
public/data/events.json
```

The browser loads that static JSON file. Visitors do not call GitHub, GitLab, Codeberg, Forgejo, Gitea, nostr relays, or Git remotes directly. Normal site usage does not consume provider API rate limits.

The full dataset shape is defined in `src/types.ts`.

Each event includes host-aware identity fields:

```ts
{
  id: string

  host: string
  repoKey: string
  repo: string

  type: EventType
  timestamp: string

  actorKey: string
  actor: string

  title: string
  url: string
  shortId: string
}
```

`repo` and `actor` are kept simple for display and search. `repoKey` and `actorKey` include the host and are used internally so same-named repos or users on different hosts do not collide.

## Repo config grammar

Repository entries live in `repos*.yml` files at the project root.

Supported entry forms:

```yaml
repos:
  # GitHub, implicit
  - owner/repo

  # Built-in Codeberg / Forgejo
  - codeberg:owner/repo

  # Built-in GitLab.com
  - gitlab:group/project
  - gitlab:group/subgroup/project

  # Plain Git URL, commits only
  - git:https://example.com/owner/repo
  - git:https://example.com/owner/repo.git

  # NIP-34 nostr repo announcement
  - "nostr:naddr1..."

  # Self-hosted Forgejo/Gitea instance label from instances.yml
  - mygitea:owner/repo
```

Rules:

- Bare `owner/name` means GitHub.
- `github:` is intentionally not accepted as an explicit prefix. Use bare `owner/name`.
- `codeberg:` is built in.
- `gitlab:` supports nested groups, such as `gitlab:group/subgroup/project`.
- `git:https://...` must use HTTPS and is commits-only.
- `nostr:naddr1...` values should be quoted in YAML because of the embedded colon.
- Self-hosted Forgejo/Gitea prefixes must be registered in `instances.yml`.

Files are merged and deduplicated during the fetch step. Fund buckets are determined from the file name unless the file sets an explicit `fund:` value.

Examples:

```yaml
# repos.general.yml
repos:
  - bitcoin/bitcoin
  - codeberg:joinmarket-ng/joinmarket-ng
  - gitlab:gitlab-org/cli
```

```yaml
# repos.nostr.yml
fund: nostr
repos:
  - nostr-dev-kit/ndk
  - "nostr:naddr1..."
```

## Self-hosted Forgejo / Gitea instances

Self-hosted Forgejo/Gitea instances are registered in `instances.yml`.

Example:

```yaml
mygitea:
  baseUrl: "https://gitea.example.org/api/v1"
  tokenEnv: "MYGITEA_TOKEN"

someforgejo:
  baseUrl: "https://forgejo.example.org/api/v1"
```

Rules:

- Host labels must be lowercase alphanumeric only.
- Built-in labels such as `codeberg`, `gitlab`, `git`, `nostr`, and `github` cannot be redefined.
- `baseUrl` should point at the instance REST API root.
- `tokenEnv` is optional. If present, it names the environment variable that holds the token for that instance.
- If `tokenEnv` is omitted or empty, requests are unauthenticated.

After registering an instance, use the label in any `repos*.yml` file:

```yaml
repos:
  - mygitea:owner/repo
```

## Data

The deployed site publishes the full dataset alongside the app:

```text
/data/events.json
```

Current deployed behavior:

- The GitHub Pages workflow fetches a 365-day dataset.
- The workflow runs on pushes to `master`.
- The workflow refreshes on a scheduled cron every 6 hours.
- The workflow can also be triggered manually from the Actions tab.
- Each successful refresh overwrites the published `events.json`.
- The published site is static.
- The browser only reads the generated JSON file.

The live `events.json` file is not a historical archive. If you need durable historical snapshots, download and archive JSON files separately.

## Main dashboard filters

All dashboard filters run client-side on the already-loaded dataset. Most filters serialize to the URL, so filtered views can be shared.

### Window filter

- UI: `30d / 60d / 90d / 180d / 365d` chips
- URL param: `?window=N`
- Match behavior: shows events from the last `N` days, limited by the built dataset

### Fund filter

- UI: fund chips
- URL param: `?funds=...`
- Match behavior: repos in the selected fund bucket

### Repo search

- UI: `filter:` text input
- URL param: `?q=...`
- Match behavior: substring match across displayed repo paths

### Repo selection

- UI: repo chips
- URL param: `?repos=...`
- Match behavior: exact repo match

### Author filter

- UI: `author:` text input
- URL param: `?author=...`
- Match behavior: exact actor match against the event actor

### Event type filter

- UI: event-type chips
- URL param: `?types=...`
- Match behavior: commit, pull request / merge request, issue, and release event subsets

### Developer chip filter

- UI: clicking a username in the timeline
- URL param: `?devs=...`
- Match behavior: exact event actor selected from the UI

Notes:

- `?q=` is repo-name search only.
- It does not search authors or event text.
- `?author=` is the strict author filter.
- Use `?author=` when preparing single-developer or single-grantee research.
- Fund names come from the `repos*.yml` files at the project root.
- Window chips larger than the built dataset may be disabled in the UI.
- A 365-day view requires the dataset to be fetched with at least `HEARTBEAT_WINDOW_DAYS=365`.

## Standalone JSON filter tool

The standalone filter tool is available at:

```text
/filter.html
```

It is useful when the full `events.json` file is too large for analysis, archiving, or uploading elsewhere.

The filter tool loads the latest deployed `data/events.json` and lets you filter by:

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

The filter tool defaults to `90d`. Choose `365d` or `all` if you want the full annual dataset.

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

The filtered export keeps the same core event data shape and also adds filter metadata:

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

`GITHUB_TOKEN` or `GH_TOKEN` is required if the config includes GitHub repos.

Optional provider tokens:

```bash
export CODEBERG_TOKEN=...
export GITLAB_TOKEN=...
export MYGITEA_TOKEN=...
```

For public Codeberg, GitLab, and self-hosted Forgejo/Gitea repos, unauthenticated requests may work, but tokens are useful for rate limits and private/inaccessible repos.

Plain Git URL entries do not use API tokens.

NIP-34 nostr entries do not use API tokens.

If you omit `HEARTBEAT_WINDOW_DAYS`, the fetch script uses the upstream-compatible default of `90`.

To generate the deployed-style annual dataset locally, keep:

```bash
export HEARTBEAT_WINDOW_DAYS=365
```

## Scripts

- `npm run dev` - Start the Vite dev server.
- `npm run fetch` - Fetch activity and write `public/data/events.json`.
- `npm run build` - Type-check and build the static site.
- `npm run preview` - Preview the built site locally.
- `npm run typecheck` - Run TypeScript checks without building.
- `npm run lint` - Run ESLint.
- `npm run format` - Format files with Prettier.
- `npm run format:check` - Check formatting.
- `npm run vercel-build` - Fetch data and build for Vercel.

## Fetch configuration

Environment variables override the fetch defaults.

### Token variables

- `GITHUB_TOKEN`
  - Default: required unless `GH_TOKEN` is set, when GitHub repos are configured
  - Purpose: GitHub token used by the GitHub provider

- `GH_TOKEN`
  - Default: optional fallback
  - Purpose: alternative GitHub token variable

- `CODEBERG_TOKEN`
  - Default: optional
  - Purpose: token for the built-in Codeberg provider

- `GITLAB_TOKEN`
  - Default: optional
  - Purpose: token for the built-in GitLab.com provider

- Custom `tokenEnv` values from `instances.yml`
  - Default: optional
  - Purpose: tokens for self-hosted Forgejo/Gitea instances

### Window variable

- `HEARTBEAT_WINDOW_DAYS`
  - Default: `90`
  - Purpose: number of days of history to fetch

### Page-size variables

- `HEARTBEAT_COMMITS_PAGE_SIZE`
  - Default: GitHub `100`, Forgejo/Gitea `50`, GitLab `50`
  - Purpose: page size for commits

- `HEARTBEAT_PRS_PAGE_SIZE`
  - Default: GitHub `50`, Forgejo/Gitea `50`, GitLab merge requests `50`
  - Purpose: page size for pull requests / merge requests

- `HEARTBEAT_ISSUES_PAGE_SIZE`
  - Default: `50`
  - Purpose: page size for issues

- `HEARTBEAT_RELEASES_PAGE_SIZE`
  - Default: `20`
  - Purpose: page size for releases

### Per-repo cap variables

- `HEARTBEAT_COMMITS_MAX_PER_REPO`
  - Default: `5000`
  - Purpose: hard cap on commits per repo

- `HEARTBEAT_PRS_MAX_PER_REPO`
  - Default: `1000`
  - Purpose: hard cap on pull requests / merge requests per repo

- `HEARTBEAT_ISSUES_MAX_PER_REPO`
  - Default: `1000`
  - Purpose: hard cap on issues per repo

- `HEARTBEAT_RELEASES_MAX_PER_REPO`
  - Default: `200`
  - Purpose: hard cap on releases per repo

The caps are safety limits. The normal terminator is the selected `HEARTBEAT_WINDOW_DAYS` cutoff.

## Retry behavior

The shared retry helper is used around transient provider failures.

It retries:

- selected HTTP 5xx responses
- network errors such as resets, temporary DNS failures, and timeouts
- fetch network failures

It does not retry:

- HTTP 4xx responses
- 404 not found
- authentication / authorization failures
- programming errors

Default retry budget:

- 3 total attempts
- exponential backoff
- jitter
- roughly 10 seconds maximum wall-time per retried request

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

For another static host, set the base path to match where the app will be served.

## Deploy

### GitHub Pages

This fork includes a GitHub Pages workflow at:

```text
.github/workflows/build.yml
```

It runs on:

- push to `master`
- scheduled cron every 6 hours
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

Use a GitHub token with access to the tracked GitHub repositories.

Optional repo secrets, depending on configured providers:

```text
CODEBERG_TOKEN
GITLAB_TOKEN
<custom tokenEnv values from instances.yml>
```

The workflow currently performs a full fetch on every push, even for README or UI-only changes. A previous attempt to decouple fetch from build was reverted. Treat future fetch/build decoupling as a separate design task, not part of normal README or version-bump work.

### Monthly repo health check

This fork includes a monthly repo health-check workflow at:

```text
.github/workflows/repo-health.yml
```

It runs on the 1st of each month and can also be triggered manually from the Actions tab.

Current limitation: the health-check workflow is GitHub-oriented. It checks repo YAML entries against the GitHub API and may not correctly understand non-GitHub prefixed entries such as `codeberg:`, `gitlab:`, `git:`, `nostr:`, or self-hosted Forgejo/Gitea labels. Treat its results as a GitHub repo-health helper, not a complete multi-provider health checker.

The workflow uses this repo secret:

```text
HEARTBEAT_PAT
```

If issues are found, it opens a GitHub Issue with the `repo-health` label. Make sure Issues are enabled on the repository.

If the repository requires labels to exist before use, create the `repo-health` label.

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

Set `HEARTBEAT_WINDOW_DAYS=365` if you want an annual dataset. Omit it to use the fetch script's default `90`.

For scheduled Vercel refreshes, set this repo secret:

```text
VERCEL_DEPLOY_HOOK_URL
```

The included workflow at `.github/workflows/refresh.yml` pings that deploy hook every 6 hours.

### Static hosting elsewhere

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

## Architecture

```text
scripts/
├── fetch.ts
├── lib/
│   └── retry.ts
└── providers/
    ├── github.ts
    ├── forgejo.ts
    ├── gitlab.ts
    ├── git.ts
    └── nostr.ts

src/
└── types.ts

repos.general.yml
repos.nostr.yml
repos.opensats.yml
instances.yml
```

`fetch.ts` owns config loading, repo-entry parsing, provider routing, dataset assembly, and writing `public/data/events.json`.

Provider modules own host-specific fetching and event shaping.

`src/types.ts` owns the shared Zod schemas for events, datasets, repo config, and self-hosted instance config.

## Known limitations

- Plain Git URLs are commits-only.
- NIP-34 repo state events are not converted into commit events.
- Cross-host mirror deduplication is not implemented.
- The monthly repo-health workflow is GitHub-oriented and not a complete multi-provider checker.
- The workflow currently does a full fetch on every push.
- `package.json` still reports version `0.1.0`; the version has not yet been bumped for the multi-provider upgrade.

## Credits

Built on [OpenSats/heartbeat](https://github.com/OpenSats/heartbeat) by the OpenSats team.

## License

MIT — see [LICENSE](LICENSE).
