// The next release, from the labels of the MRs merged since the previous tag (changelog::added | changed |
// fixed | internal, plus an optional changelog::breaking). Prints JSON: previous, version (null when only
// `internal` changed), bump, section (the CHANGELOG section, rendered deterministically) and merged.
//   node ci/next-release.ts [--previous <tag>] [--to <ref>]
// env: CI_API_V4_URL, CI_PROJECT_ID | CI_PROJECT_PATH, GITLAB_TOKEN | RELEASE_TOKEN | CI_JOB_TOKEN, RELEASE_DATE
import { execFileSync } from 'node:child_process';

export type Kind = 'added' | 'changed' | 'fixed' | 'internal';
export type Bump = 'major' | 'minor' | 'patch';

export interface MergeRequest {
    readonly iid: number;
    readonly title: string;
    readonly state: string;
    readonly target_branch: string;
    readonly labels: readonly string[];
}

export interface Entry {
    readonly iid: number;
    readonly title: string;
    readonly kind: Kind;
    readonly breaking: boolean;
}

export interface Release {
    readonly previous: string;
    readonly version: string | null;
    readonly bump: Bump | null;
    readonly section: string | null;
    readonly merged: number;
}

export type Get = (path: string) => Promise<unknown>;

const KINDS: readonly Kind[] = ['added', 'changed', 'fixed', 'internal'];
const PREFIX = 'changelog::';
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function entryOf(mr: MergeRequest): Entry {
    const own = mr.labels.filter((label) => label.startsWith(PREFIX)).map((label) => label.slice(PREFIX.length));
    const kinds = own.filter((name): name is Kind => KINDS.some((kind) => kind === name));
    const unknown = own.filter((name) => name !== 'breaking' && !KINDS.some((kind) => kind === name));
    const [kind] = kinds;
    if (kind === undefined || kinds.length !== 1 || unknown.length > 0) {
        throw new Error(`!${mr.iid} "${mr.title}" needs exactly one of ${KINDS.map((k) => PREFIX + k).join(' | ')} (it has: ${own.join(', ') || 'none'})`);
    }
    return { iid: mr.iid, title: mr.title.trim(), kind, breaking: own.includes('breaking') };
}

export function bumpOf(entries: readonly Entry[]): Bump | null {
    if (entries.some((entry) => entry.breaking)) {
        return 'major';
    }
    if (entries.some((entry) => entry.kind === 'added')) {
        return 'minor';
    }
    return entries.some((entry) => entry.kind === 'changed' || entry.kind === 'fixed') ? 'patch' : null;
}

export function bumped(version: string, bump: Bump): string {
    const parts = SEMVER.exec(version)?.slice(1).map(Number);
    const [major, minor, patch] = parts ?? [];
    if (major === undefined || minor === undefined || patch === undefined) {
        throw new Error(`not a version: ${version}`);
    }
    if (bump === 'major') {
        return `${major + 1}.0.0`;
    }
    return bump === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

const HEADINGS: readonly (readonly [Kind, string])[] = [['added', 'Added'], ['changed', 'Changed'], ['fixed', 'Fixed']];

const bullet = (entry: Entry): string => `- ${entry.title} (!${entry.iid})`;

/** `### [x.y.z] — date`, then Breaking, Added, Changed, Fixed; `internal` is omitted. */
export function renderSection(version: string, date: string, entries: readonly Entry[]): string {
    const groups: (readonly [string, readonly Entry[]])[] = [
        ['Breaking', entries.filter((entry) => entry.breaking)],
        ...HEADINGS.map(([kind, heading]): readonly [string, readonly Entry[]] => [heading, entries.filter((entry) => entry.kind === kind)]),
    ];
    const body = groups.filter(([, list]) => list.length > 0).map(([heading, list]) => `#### ${heading}\n\n${list.map(bullet).join('\n')}`);
    return [`### [${version}] — ${date}`, ...body].join('\n\n');
}

/** The newest `<plugin>-v<x.y.z>` among the tag names, by version. */
export function latestTag(tags: readonly string[], plugin: string): string | null {
    const prefix = `${plugin}-v`;
    const versions = tags.filter((tag) => tag.startsWith(prefix) && SEMVER.test(tag.slice(prefix.length)));
    const key = (tag: string): number[] => tag.slice(prefix.length).split('.').map(Number);
    const newest = versions.toSorted((a, b) => {
        const [x, y] = [key(a), key(b)];
        return (x[0] ?? 0) - (y[0] ?? 0) || (x[1] ?? 0) - (y[1] ?? 0) || (x[2] ?? 0) - (y[2] ?? 0);
    }).at(-1);
    return newest ?? null;
}

const asList = (value: unknown): readonly Record<string, unknown>[] => (Array.isArray(value) ? value as Record<string, unknown>[] : []);

/** The MRs merged into `target` that brought in the commits of previous..to, once each, oldest first. */
export async function mergedSince(get: Get, previous: string, to: string, target: string): Promise<readonly MergeRequest[]> {
    const compared = await get(`/repository/compare?from=${encodeURIComponent(previous)}&to=${encodeURIComponent(to)}`);
    const commits = asList((compared as { commits?: unknown }).commits);
    const found = new Map<number, MergeRequest>();
    for (const commit of commits) {
        for (const mr of asList(await get(`/repository/commits/${String(commit.id)}/merge_requests?per_page=100`))) {
            const candidate = mr as unknown as MergeRequest;
            if (candidate.state === 'merged' && candidate.target_branch === target) {
                found.set(candidate.iid, candidate);
            }
        }
    }
    return [...found.values()].toSorted((a, b) => a.iid - b.iid);
}

export async function release(get: Get, previous: string, to: string, date: string, plugin: string): Promise<Release> {
    const entries = (await mergedSince(get, previous, to, 'main')).map(entryOf);
    const bump = bumpOf(entries);
    const base = previous.slice(`${plugin}-v`.length);
    if (bump === null) {
        return { previous, version: null, bump, section: null, merged: entries.length };
    }
    const version = bumped(base, bump);
    return { previous, version, bump, section: renderSection(version, date, entries), merged: entries.length };
}

function api(): Get {
    const { CI_API_V4_URL: url, CI_PROJECT_ID: id, CI_PROJECT_PATH: path } = process.env;
    const token = process.env.GITLAB_TOKEN ?? process.env.RELEASE_TOKEN;
    const header = token === undefined ? { 'JOB-TOKEN': process.env.CI_JOB_TOKEN ?? '' } : { 'PRIVATE-TOKEN': token };
    if (url === undefined || (id === undefined && path === undefined)) {
        throw new Error('set CI_API_V4_URL and CI_PROJECT_ID (or CI_PROJECT_PATH)');
    }
    const project = id ?? encodeURIComponent(path ?? '');
    return async (route) => {
        const response = await fetch(`${url}/projects/${project}${route}`, { headers: header });
        if (!response.ok) {
            throw new Error(`GET ${route} → ${response.status}`);
        }
        return response.json();
    };
}

function option(name: string): string | undefined {
    const at = process.argv.indexOf(name);
    return at < 0 ? undefined : process.argv[at + 1];
}

async function main(): Promise<void> {
    const plugin = process.env.PLUGIN ?? 'tab-recap';
    const tags = execFileSync('git', ['tag', '-l', `${plugin}-v*`], { encoding: 'utf8' }).split('\n');
    const previous = option('--previous') ?? latestTag(tags, plugin);
    if (previous === null) {
        throw new Error(`no ${plugin}-v* tag to start from`);
    }
    const date = process.env.RELEASE_DATE ?? new Date().toISOString().slice(0, 10);
    const result = await release(api(), previous, option('--to') ?? 'main', date, plugin);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.main) {
    main().catch((error: unknown) => {
        process.stderr.write(`next-release: 1 — ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
