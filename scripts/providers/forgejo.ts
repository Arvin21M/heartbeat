import type { Event, EventType } from '../../src/types';

// --- Provider identity ------------------------------------------------------
//
// This provider speaks the Forgejo/Gitea REST API. It is currently hardcoded
// to Codeberg as the only instance. Self-hosted Forgejo/Gitea support (with a
// configurable base URL and per-instance host label) is deferred to a later
// PR.

export const CODEBERG_BASE_URL = 'https://codeberg.org/api/v1';
export const CODEBERG_HOST = 'codeberg';

function repoKeyFor(host: string, ownerName: string): string {
  return `${host}:${ownerName}`;
}

function actorKeyFor(host: string, actor: string): string {
  return `${host}:${actor}`;
}

// --- Configurable knobs (env vars override defaults) ------------------------

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number, got: ${raw}`);
  }
  return Math.floor(n);
}

const COMMITS_PAGE_SIZE = intFromEnv('HEARTBEAT_COMMITS_PAGE_SIZE', 50);
const PRS_PAGE_SIZE = intFromEnv('HEARTBEAT_PRS_PAGE_SIZE', 50);
const ISSUES_PAGE_SIZE = intFromEnv('HEARTBEAT_ISSUES_PAGE_SIZE', 50);
const RELEASES_PAGE_SIZE = intFromEnv('HEARTBEAT_RELEASES_PAGE_SIZE', 20);

const COMMITS_MAX_PER_REPO = intFromEnv('HEARTBEAT_COMMITS_MAX_PER_REPO', 5000);
const PRS_MAX_PER_REPO = intFromEnv('HEARTBEAT_PRS_MAX_PER_REPO', 1000);
const ISSUES_MAX_PER_REPO = intFromEnv('HEARTBEAT_ISSUES_MAX_PER_REPO', 1000);
const RELEASES_MAX_PER_REPO = intFromEnv('HEARTBEAT_RELEASES_MAX_PER_REPO', 200);

// --- REST response shapes ---------------------------------------------------
//
// Only fields we actually read are typed. Anything else from the API is
// ignored.

type ForgejoUser = { login?: string | null } | null | undefined;

type ForgejoCommitAuthor = {
  name?: string | null;
  email?: string | null;
  date?: string | null;
} | null;

type ForgejoCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: ForgejoCommitAuthor;
    committer: ForgejoCommitAuthor;
  };
  author?: ForgejoUser;
  committer?: ForgejoUser;
  created?: string;
};

type ForgejoPull = {
  number: number;
  title: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged: boolean;
  merged_at: string | null;
  user: ForgejoUser;
  merged_by?: ForgejoUser;
};

type ForgejoIssue = {
  number: number;
  title: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  user: ForgejoUser;
  // pull_request is present on issues that are PRs; we filter via type=issues
  // but defensively double-check.
  pull_request?: unknown;
};

type ForgejoRelease = {
  tag_name: string;
  name: string | null;
  html_url: string;
  created_at: string;
  published_at: string | null;
  author: ForgejoUser;
};

type ForgejoRepo = {
  default_branch: string;
};

// --- HTTP client ------------------------------------------------------------

export type ForgejoClient = {
  baseUrl: string;
  host: string;
  get: <T>(path: string) => Promise<{ status: number; body: T | null }>;
};

export function getCodebergToken(): string | undefined {
  const t = process.env.CODEBERG_TOKEN;
  return t && t !== '' ? t : undefined;
}

export function makeForgejoClient(options: {
  baseUrl: string;
  host: string;
  token?: string;
}): ForgejoClient {
  const { baseUrl, host, token } = options;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'heartbeat365/forgejo-provider',
  };
  if (token) {
    headers.Authorization = `token ${token}`;
  }

  return {
    baseUrl,
    host,
    async get<T>(path: string) {
      const url = `${baseUrl}${path}`;
      const res = await fetch(url, { headers });
      if (res.status === 404) {
        return { status: 404, body: null };
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} on ${path}: ${text.slice(0, 200)}`);
      }
      const body = (await res.json()) as T;
      return { status: res.status, body };
    },
  };
}

// --- Pagination -------------------------------------------------------------

async function paginate<T extends { updated_at?: string; created_at?: string }>(
  client: ForgejoClient,
  pathBase: string,
  pageSize: number,
  maxNodes: number,
  cutoffMs: number,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  const sep = pathBase.includes('?') ? '&' : '?';

  while (all.length < maxNodes) {
    const limit = Math.min(pageSize, maxNodes - all.length);
    const path = `${pathBase}${sep}page=${page}&limit=${limit}`;
    const { body } = await client.get<T[]>(path);
    if (!body || body.length === 0) break;

    all.push(...body);

    const last = body[body.length - 1];
    const lastTs = last?.updated_at ?? last?.created_at;
    if (lastTs && Date.parse(lastTs) < cutoffMs) break;

    if (body.length < limit) break;
    page += 1;
  }

  return all;
}

async function fetchCommits(
  client: ForgejoClient,
  ownerName: string,
  defaultBranch: string,
  sinceISO: string,
): Promise<ForgejoCommit[]> {
  const all: ForgejoCommit[] = [];
  let page = 1;

  while (all.length < COMMITS_MAX_PER_REPO) {
    const limit = Math.min(COMMITS_PAGE_SIZE, COMMITS_MAX_PER_REPO - all.length);
    const path =
      `/repos/${ownerName}/commits` +
      `?sha=${encodeURIComponent(defaultBranch)}` +
      `&since=${encodeURIComponent(sinceISO)}` +
      `&page=${page}&limit=${limit}`;

    const { body } = await client.get<ForgejoCommit[]>(path);
    if (!body || body.length === 0) break;

    all.push(...body);

    if (body.length < limit) break;
    page += 1;
  }

  return all;
}

// --- Event shaping ----------------------------------------------------------

type EventInput = {
  host: string;
  repo: string;
  type: EventType;
  nativeId: string;
  timestamp: string;
  actor: string;
  title: string;
  url: string;
  shortId: string;
};

function makeEvent(e: EventInput): Event {
  const repoKey = repoKeyFor(e.host, e.repo);
  const actorKey = actorKeyFor(e.host, e.actor);

  return {
    id: `${repoKey}:${e.type}:${e.nativeId}`,
    host: e.host,
    repoKey,
    repo: e.repo,
    type: e.type,
    timestamp: e.timestamp,
    actorKey,
    actor: e.actor,
    title: e.title,
    url: e.url,
    shortId: e.shortId,
  };
}

function actorLogin(u: ForgejoUser, fallbackName?: string | null): string {
  return u?.login ?? fallbackName ?? 'unknown';
}

function commitTimestamp(c: ForgejoCommit): string | null {
  return c.commit?.committer?.date ?? c.commit?.author?.date ?? c.created ?? null;
}

function commitMessageHeadline(c: ForgejoCommit): string {
  const msg = c.commit?.message ?? '';
  const firstLine = msg.split('\n', 1)[0];
  return firstLine.trim();
}

function commitToEvents(host: string, repo: string, c: ForgejoCommit): Event[] {
  const timestamp = commitTimestamp(c);
  if (!timestamp) return [];

  const actor = actorLogin(c.author, c.commit?.author?.name);
  return [
    makeEvent({
      host,
      repo,
      type: 'commit',
      nativeId: c.sha,
      timestamp,
      actor,
      title: commitMessageHeadline(c),
      url: c.html_url,
      shortId: c.sha.slice(0, 7),
    }),
  ];
}

function pullToEvents(host: string, repo: string, p: ForgejoPull): Event[] {
  const common = {
    host,
    repo,
    nativeId: String(p.number),
    title: p.title,
    url: p.html_url,
    shortId: `#${p.number}`,
  };
  const events: Event[] = [
    makeEvent({
      ...common,
      type: 'pr_opened',
      timestamp: p.created_at,
      actor: actorLogin(p.user),
    }),
  ];
  if (p.merged && p.merged_at) {
    events.push(
      makeEvent({
        ...common,
        type: 'pr_merged',
        timestamp: p.merged_at,
        actor: actorLogin(p.merged_by ?? p.user),
      }),
    );
  } else if (p.closed_at) {
    events.push(
      makeEvent({
        ...common,
        type: 'pr_closed',
        timestamp: p.closed_at,
        actor: actorLogin(p.user),
      }),
    );
  }
  return events;
}

function issueToEvents(host: string, repo: string, i: ForgejoIssue): Event[] {
  // Defensive: skip anything that's actually a PR even if type=issues filter
  // didn't catch it.
  if (i.pull_request) return [];

  const common = {
    host,
    repo,
    nativeId: String(i.number),
    title: i.title,
    url: i.html_url,
    shortId: `#${i.number}`,
    actor: actorLogin(i.user),
  };
  const events: Event[] = [
    makeEvent({ ...common, type: 'issue_opened', timestamp: i.created_at }),
  ];
  if (i.closed_at) {
    events.push(makeEvent({ ...common, type: 'issue_closed', timestamp: i.closed_at }));
  }
  return events;
}

function releaseToEvents(host: string, repo: string, r: ForgejoRelease): Event[] {
  return [
    makeEvent({
      host,
      repo,
      type: 'release',
      nativeId: r.tag_name,
      timestamp: r.published_at ?? r.created_at,
      actor: actorLogin(r.author),
      title: r.name ?? r.tag_name,
      url: r.html_url,
      shortId: r.tag_name,
    }),
  ];
}

// --- Public entry point -----------------------------------------------------

export type ForgejoFetchResult = {
  events: Event[];
  ok: boolean;
  reason?: string;
};

export async function fetchForgejoRepo(
  client: ForgejoClient,
  ownerName: string,
  cutoffMs: number,
): Promise<ForgejoFetchResult> {
  const sinceISO = new Date(cutoffMs).toISOString();
  const host = client.host;

  // Step 1: resolve the default branch.
  let defaultBranch: string;
  try {
    const { status, body } = await client.get<ForgejoRepo>(`/repos/${ownerName}`);
    if (status === 404 || !body) {
      return { events: [], ok: false, reason: 'not found or inaccessible' };
    }
    defaultBranch = body.default_branch;
  } catch (err) {
    return { events: [], ok: false, reason: `repo lookup failed: ${(err as Error).message}` };
  }

  // Step 2: fetch commits (paginated, since-bounded).
  let commits: ForgejoCommit[];
  try {
    commits = await fetchCommits(client, ownerName, defaultBranch, sinceISO);
  } catch (err) {
    return { events: [], ok: false, reason: `commits fetch failed: ${(err as Error).message}` };
  }

  // Step 3: fetch PRs, issues, releases in parallel.
  const [pulls, issues, releases] = await Promise.all([
    paginate<ForgejoPull>(
      client,
      `/repos/${ownerName}/pulls?state=all&sort=recentupdate`,
      PRS_PAGE_SIZE,
      PRS_MAX_PER_REPO,
      cutoffMs,
    ),
    paginate<ForgejoIssue>(
      client,
      `/repos/${ownerName}/issues?state=all&type=issues&sort=recentupdate`,
      ISSUES_PAGE_SIZE,
      ISSUES_MAX_PER_REPO,
      cutoffMs,
    ),
    paginate<ForgejoRelease>(
      client,
      `/repos/${ownerName}/releases`,
      RELEASES_PAGE_SIZE,
      RELEASES_MAX_PER_REPO,
      cutoffMs,
    ),
  ]);

  const events = [
    ...commits.flatMap((c) => commitToEvents(host, ownerName, c)),
    ...pulls.flatMap((p) => pullToEvents(host, ownerName, p)),
    ...issues.flatMap((i) => issueToEvents(host, ownerName, i)),
    ...releases.flatMap((r) => releaseToEvents(host, ownerName, r)),
  ];

  return { events, ok: true };
}
