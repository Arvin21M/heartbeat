import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { graphql } from '@octokit/graphql';
import yaml from 'js-yaml';
import {
  ConfigSchema,
  DatasetSchema,
  type Dataset,
  type Event,
  type EventType,
} from '../src/types';

type LoadedConfig = {
  repos: string[];
  funds: Record<string, string[]>;
};

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

const WINDOW_DAYS = intFromEnv('HEARTBEAT_WINDOW_DAYS', 90);

const COMMITS_PAGE_SIZE = intFromEnv('HEARTBEAT_COMMITS_PAGE_SIZE', 100);
const PRS_PAGE_SIZE = intFromEnv('HEARTBEAT_PRS_PAGE_SIZE', 50);
const ISSUES_PAGE_SIZE = intFromEnv('HEARTBEAT_ISSUES_PAGE_SIZE', 50);
const RELEASES_PAGE_SIZE = intFromEnv('HEARTBEAT_RELEASES_PAGE_SIZE', 20);

const COMMITS_MAX_PER_REPO = intFromEnv('HEARTBEAT_COMMITS_MAX_PER_REPO', 5000);
const PRS_MAX_PER_REPO = intFromEnv('HEARTBEAT_PRS_MAX_PER_REPO', 1000);
const ISSUES_MAX_PER_REPO = intFromEnv('HEARTBEAT_ISSUES_MAX_PER_REPO', 1000);
const RELEASES_MAX_PER_REPO = intFromEnv('HEARTBEAT_RELEASES_MAX_PER_REPO', 200);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE_PATTERN = /^repos(\..+)?\.ya?ml$/i;
const OUT_PATH = resolve(ROOT, 'public/data/events.json');

// --- GraphQL response shapes ------------------------------------------------

type Actor = { login: string } | null;

type CommitNode = {
  oid: string;
  abbreviatedOid: string;
  committedDate: string;
  messageHeadline: string;
  url: string;
  author: { user: Actor; name: string | null } | null;
};

type PrNode = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  merged: boolean;
  author: Actor;
  mergedBy: Actor;
};

type IssueNode = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  author: Actor;
};

type ReleaseNode = {
  tagName: string;
  name: string | null;
  url: string;
  publishedAt: string | null;
  createdAt: string;
  author: Actor;
};

type PageInfo = { hasNextPage: boolean; endCursor: string | null };

type Connection<T> = { pageInfo: PageInfo; nodes: T[] };

type CommitsHistoryResponse = {
  repository: {
    defaultBranchRef: {
      target: {
        history: Connection<CommitNode>;
      } | null;
    } | null;
  } | null;
};

// --- GraphQL queries: one per connection so each can paginate independently -

const COMMITS_QUERY = /* GraphQL */ `
  query Commits(
    $owner: String!
    $name: String!
    $first: Int!
    $after: String
    $since: GitTimestamp!
  ) {
    repository(owner: $owner, name: $name) {
      defaultBranchRef {
        target {
          ... on Commit {
            history(first: $first, after: $after, since: $since) {
              pageInfo { hasNextPage endCursor }
              nodes {
                oid
                abbreviatedOid
                committedDate
                messageHeadline
                url
                author {
                  name
                  user { login }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const PRS_QUERY = /* GraphQL */ `
  query Prs($owner: String!, $name: String!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      pullRequests(first: $first, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          url
          createdAt
          updatedAt
          mergedAt
          closedAt
          merged
          author { login }
          mergedBy { login }
        }
      }
    }
  }
`;

const ISSUES_QUERY = /* GraphQL */ `
  query Issues($owner: String!, $name: String!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      issues(first: $first, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          url
          createdAt
          updatedAt
          closedAt
          author { login }
        }
      }
    }
  }
`;

const RELEASES_QUERY = /* GraphQL */ `
  query Releases($owner: String!, $name: String!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      releases(first: $first, after: $after, orderBy: { field: CREATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          tagName
          name
          url
          publishedAt
          createdAt
          author { login }
        }
      }
    }
  }
`;

// --- Event shaping (unchanged from original) --------------------------------

type EventInput = {
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
  return {
    id: `${e.repo}:${e.type}:${e.nativeId}`,
    repo: e.repo,
    type: e.type,
    timestamp: e.timestamp,
    actor: e.actor,
    title: e.title,
    url: e.url,
    shortId: e.shortId,
  };
}

const login = (a: Actor) => a?.login ?? 'unknown';

function commitToEvents(repo: string, n: CommitNode): Event[] {
  return [
    makeEvent({
      repo,
      type: 'commit',
      nativeId: n.oid,
      timestamp: n.committedDate,
      actor: n.author?.user?.login ?? n.author?.name ?? 'unknown',
      title: n.messageHeadline,
      url: n.url,
      shortId: n.abbreviatedOid,
    }),
  ];
}

function prToEvents(repo: string, n: PrNode): Event[] {
  const common = {
    repo,
    nativeId: String(n.number),
    title: n.title,
    url: n.url,
    shortId: `#${n.number}`,
  };
  const events: Event[] = [
    makeEvent({ ...common, type: 'pr_opened', timestamp: n.createdAt, actor: login(n.author) }),
  ];
  if (n.merged && n.mergedAt) {
    events.push(
      makeEvent({
        ...common,
        type: 'pr_merged',
        timestamp: n.mergedAt,
        actor: login(n.mergedBy ?? n.author),
      }),
    );
  } else if (n.closedAt) {
    events.push(
      makeEvent({ ...common, type: 'pr_closed', timestamp: n.closedAt, actor: login(n.author) }),
    );
  }
  return events;
}

function issueToEvents(repo: string, n: IssueNode): Event[] {
  const common = {
    repo,
    nativeId: String(n.number),
    title: n.title,
    url: n.url,
    shortId: `#${n.number}`,
    actor: login(n.author),
  };
  const events: Event[] = [makeEvent({ ...common, type: 'issue_opened', timestamp: n.createdAt })];
  if (n.closedAt)
    events.push(makeEvent({ ...common, type: 'issue_closed', timestamp: n.closedAt }));
  return events;
}

function releaseToEvents(repo: string, n: ReleaseNode): Event[] {
  return [
    makeEvent({
      repo,
      type: 'release',
      nativeId: n.tagName,
      timestamp: n.publishedAt ?? n.createdAt,
      actor: login(n.author),
      title: n.name ?? n.tagName,
      url: n.url,
      shortId: n.tagName,
    }),
  ];
}

function fundFromFilename(file: string): string {
  const m = file.match(/^repos\.(.+)\.ya?ml$/i);
  return m ? m[1].toLowerCase() : 'general';
}

async function loadConfig(): Promise<LoadedConfig> {
  const files = (await readdir(ROOT)).filter((f) => CONFIG_FILE_PATTERN.test(f)).sort();
  if (files.length === 0) {
    throw new Error('No repos.yml or repos.<group>.yml files found at the project root.');
  }
  const all = new Set<string>();
  const funds: Record<string, Set<string>> = {};
  for (const file of files) {
    const raw = await readFile(resolve(ROOT, file), 'utf8');
    const parsed = ConfigSchema.parse(yaml.load(raw));
    const fundName = parsed.fund ?? fundFromFilename(file);
    console.log(`  ${file}: ${parsed.repos.length} repos -> "${fundName}"`);
    const bucket = (funds[fundName] ??= new Set<string>());
    for (const r of parsed.repos) {
      all.add(r);
      bucket.add(r);
    }
  }
  return {
    repos: [...all].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    funds: Object.fromEntries(
      Object.entries(funds).map(([k, v]) => [
        k,
        [...v].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
      ]),
    ),
  };
}

function getToken(): string {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN (or GH_TOKEN) is required to run the fetcher.');
  }
  return token;
}

// --- Pagination -------------------------------------------------------------

type GraphqlClient = typeof graphql;

async function paginate<T extends { updatedAt?: string; createdAt: string }>(
  client: GraphqlClient,
  query: string,
  owner: string,
  name: string,
  pageSize: number,
  maxNodes: number,
  cutoffMs: number,
  pickConnection: (data: any) => Connection<T> | null,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  while (all.length < maxNodes) {
    const data = await client<any>(query, {
      owner,
      name,
      first: Math.min(pageSize, maxNodes - all.length),
      after: cursor,
    });
    const conn = pickConnection(data);
    if (!conn) break;
    all.push(...conn.nodes);
    // Items are sorted desc by updatedAt (or createdAt for releases). Once the
    // last item on a page falls before the cutoff, no later page contains
    // anything in-window — stop.
    const last = conn.nodes[conn.nodes.length - 1];
    if (last) {
      const lastTs = last.updatedAt ?? last.createdAt;
      if (Date.parse(lastTs) < cutoffMs) break;
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return all;
}

async function fetchCommits(
  client: GraphqlClient,
  owner: string,
  name: string,
  sinceISO: string,
): Promise<{ commits: CommitNode[]; repoFound: boolean }> {
  const all: CommitNode[] = [];
  let cursor: string | null = null;
  let repoFound = true;
  while (all.length < COMMITS_MAX_PER_REPO) {
    const data = await client<CommitsHistoryResponse>(COMMITS_QUERY, {
      owner,
      name,
      first: Math.min(COMMITS_PAGE_SIZE, COMMITS_MAX_PER_REPO - all.length),
      after: cursor,
      since: sinceISO,
    });
    if (data.repository == null) {
      repoFound = false;
      break;
    }
    const history = data.repository.defaultBranchRef?.target?.history;
    if (!history) break;
    all.push(...history.nodes);
    if (!history.pageInfo.hasNextPage) break;
    cursor = history.pageInfo.endCursor;
  }
  return { commits: all, repoFound };
}

async function fetchRepo(
  client: GraphqlClient,
  ownerName: string,
  cutoffMs: number,
): Promise<Event[]> {
  const [owner, name] = ownerName.split('/');
  const sinceISO = new Date(cutoffMs).toISOString();

  let commitsResult: { commits: CommitNode[]; repoFound: boolean };
  try {
    commitsResult = await fetchCommits(client, owner, name, sinceISO);
  } catch (err) {
    console.warn(`! ${ownerName}: commits fetch failed: ${(err as Error).message}`);
    return [];
  }
  if (!commitsResult.repoFound) {
    console.warn(`! ${ownerName}: not found or inaccessible, skipping`);
    return [];
  }

  const [prs, issues, releases] = await Promise.all([
    paginate<PrNode>(
      client,
      PRS_QUERY,
      owner,
      name,
      PRS_PAGE_SIZE,
      PRS_MAX_PER_REPO,
      cutoffMs,
      (data) => data?.repository?.pullRequests ?? null,
    ),
    paginate<IssueNode>(
      client,
      ISSUES_QUERY,
      owner,
      name,
      ISSUES_PAGE_SIZE,
      ISSUES_MAX_PER_REPO,
      cutoffMs,
      (data) => data?.repository?.issues ?? null,
    ),
    paginate<ReleaseNode>(
      client,
      RELEASES_QUERY,
      owner,
      name,
      RELEASES_PAGE_SIZE,
      RELEASES_MAX_PER_REPO,
      cutoffMs,
      (data) => data?.repository?.releases ?? null,
    ),
  ]);

  return [
    ...commitsResult.commits.flatMap((n) => commitToEvents(ownerName, n)),
    ...prs.flatMap((n) => prToEvents(ownerName, n)),
    ...issues.flatMap((n) => issueToEvents(ownerName, n)),
    ...releases.flatMap((n) => releaseToEvents(ownerName, n)),
  ];
}

async function main() {
  const config = await loadConfig();
  const token = getToken();
  const client = graphql.defaults({ headers: { authorization: `token ${token}` } });
  const cutoffMs = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;

  console.log(`Fetching ${config.repos.length} repo(s), window=${WINDOW_DAYS}d`);

  const all: Event[] = [];
  for (const repo of config.repos) {
    try {
      const events = await fetchRepo(client, repo, cutoffMs);
      const recent = events.filter((e) => Date.parse(e.timestamp) >= cutoffMs);
      console.log(`  ${repo}: ${recent.length} events (of ${events.length} fetched)`);
      all.push(...recent);
    } catch (err) {
      console.error(`! ${repo}: ${(err as Error).message}`);
    }
  }

  all.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

  const dataset: Dataset = {
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    repos: config.repos,
    funds: config.funds,
    events: all,
  };
  DatasetSchema.parse(dataset);
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(dataset, null, 2) + '\n');
  console.log(`Wrote ${all.length} events -> ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
