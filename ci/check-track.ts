import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

type Entry = string | { readonly lane: string };

type TrackMap = {
    readonly locked: readonly string[];
    readonly tracks: Readonly<Record<string, readonly Entry[]>>;
    readonly shared: Readonly<Record<string, readonly string[]>>;
    readonly open: readonly string[];
};

type Lanes = Readonly<Record<string, readonly string[]>>;

type Branch =
    | { readonly kind: 'track'; readonly track: string; readonly deps: boolean }
    | { readonly kind: 'lane' }
    | { readonly kind: 'release' }
    | { readonly kind: 'other' };

const TRACK_BRANCH = /^track\/(FND|ENG|PHB|STO|VIEW|HOOK|PANE|CI|UP|HOST|SW)-/u;
const DEPS_BRANCH = /^track\/FND-deps-/u;
const LANE_BRANCH = /^lane\/B[1-8]-/u;
const RELEASE_BRANCH = /^release\//u;
const B_LANE = /^B[1-8]$/u;
const CROSSES = 'track-scope::crosses';
const PLUGIN = 'tab-recap/';
const RELEASE_FILES: readonly string[] = ['CHANGELOG.md', 'tab-recap/package.json', 'tab-recap/herdr-plugin.toml'];
const DEPENDENCY_FIELDS: readonly string[] = ['dependencies', 'devDependencies', 'peerDependencies', 'workspaces'];
const RULED_FIELDS: readonly string[] = [...DEPENDENCY_FIELDS, 'version', 'scripts', 'exports'];
const DEFAULT_OWNER = 'FND';

function notCovered(message: string): never {
    process.stderr.write(`check-track: 3 — NOT COVERED: ${message}\n`);
    process.exit(3);
}

function readJson(path: string): unknown {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        return notCovered(`${path}: ${String(error)}`);
    }
}

function isRecord(input: unknown): input is Readonly<Record<string, unknown>> {
    return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function isStrings(input: unknown): input is readonly string[] {
    return Array.isArray(input) && input.every((item) => typeof item === 'string');
}

function isEntry(input: unknown): input is Entry {
    return typeof input === 'string' || (isRecord(input) && typeof input['lane'] === 'string');
}

function parseTrackMap(path: string): TrackMap {
    const input = readJson(path);
    if (!isRecord(input) || !isStrings(input['locked']) || !isStrings(input['open']) || !isRecord(input['tracks']) || !isRecord(input['shared'])) {
        return notCovered(`${path}: needs "locked", "tracks", "shared" and "open"`);
    }
    const tracks = input['tracks'];
    const shared = input['shared'];
    const badTrack = Object.entries(tracks).find(([, entries]) => !Array.isArray(entries) || !entries.every(isEntry));
    if (badTrack !== undefined) return notCovered(`${path}: track ${badTrack[0]} must list globs or { "lane": <key> }`);
    const badShared = Object.entries(shared).find(([, owners]) => !isStrings(owners));
    if (badShared !== undefined) return notCovered(`${path}: shared ${badShared[0]} must list track names`);
    return {
        locked: input['locked'],
        open: input['open'],
        tracks: Object.fromEntries(Object.entries(tracks).map(([name, entries]) => [name, Array.isArray(entries) ? entries.filter(isEntry) : []])),
        shared: Object.fromEntries(Object.entries(shared).map(([glob, owners]) => [glob, isStrings(owners) ? owners : []])),
    };
}

function parseLanes(path: string): Lanes {
    const input = readJson(path);
    if (!isRecord(input) || !isRecord(input['lanes'])) return notCovered(`${path}: the lane map holds an object under "lanes"`);
    const lanes = input['lanes'];
    const bad = Object.entries(lanes).find(([, files]) => !isStrings(files));
    if (bad !== undefined) return notCovered(`${path}: lane ${bad[0]} must list file names`);
    return Object.fromEntries(Object.entries(lanes).map(([name, files]) => [name, isStrings(files) ? files : []]));
}

function escaped(text: string): string {
    return text.replace(/[.+?^$()|[\]\\]/gu, '\\$&');
}

function patternOf(glob: string): RegExp {
    let source = '';
    let index = 0;
    while (index < glob.length) {
        const char = glob.charAt(index);
        if (glob.startsWith('**', index)) {
            source += '.*';
            index += 2;
        } else if (char === '*') {
            source += '[^/]*';
            index += 1;
        } else if (char === '{' && glob.indexOf('}', index) > index) {
            const end = glob.indexOf('}', index);
            source += `(?:${glob.slice(index + 1, end).split(',').map(escaped).join('|')})`;
            index = end + 1;
        } else {
            source += escaped(char);
            index += 1;
        }
    }
    return new RegExp(`^${source}$`, 'u');
}

function matches(glob: string, path: string): boolean {
    return patternOf(glob).test(path);
}

function branchOf(name: string): Branch {
    const track = TRACK_BRANCH.exec(name)?.[1];
    if (track !== undefined) return { kind: 'track', track, deps: DEPS_BRANCH.test(name) };
    if (LANE_BRANCH.test(name)) return { kind: 'lane' };
    if (RELEASE_BRANCH.test(name)) return { kind: 'release' };
    return { kind: 'other' };
}

const name = process.argv[2] ?? process.env['CI_MERGE_REQUEST_SOURCE_BRANCH_NAME'] ?? '';
if (name === '') notCovered('usage: bun ci/check-track.ts <source-branch> (or set CI_MERGE_REQUEST_SOURCE_BRANCH_NAME)');
const branch = branchOf(name);
const crossing = process.env['TRACK_CROSSES'] === '1' || `,${process.env['CI_MERGE_REQUEST_LABELS'] ?? ''},`.includes(`,${CROSSES},`);
const map = parseTrackMap(process.env['TRACKS_FILE'] ?? 'ci/tracks.json');
const lanes = parseLanes(process.env['LANES_FILE'] ?? 'tab-recap/ci/lanes.json');

function baseRef(): string {
    const given = process.env['TRACK_BASE'];
    if (given !== undefined && given !== '') return given;
    const target = process.env['CI_MERGE_REQUEST_TARGET_BRANCH_NAME'];
    return target === undefined || target === '' ? 'origin/main' : `origin/${target}`;
}

const mergeBase = ((): (() => string) => {
    let found: string | null = null;
    return (): string => {
        if (found !== null) return found;
        try {
            found = execFileSync('git', ['merge-base', 'HEAD', baseRef()], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
        } catch {
            return notCovered(`no merge base with ${baseRef()}`);
        }
        return found;
    };
})();

function changedFiles(): readonly string[] {
    const given = process.env['CHANGED_FILES'];
    if (given !== undefined) return given.split('\n').filter((line) => line !== '');
    try {
        return execFileSync('git', ['diff', '--name-only', '--no-renames', `${mergeBase()}...HEAD`], { encoding: 'utf8' }).split('\n').filter((line) => line !== '');
    } catch {
        return notCovered(`cannot list the files changed since ${baseRef()}`);
    }
}

function laneKeyOf(path: string): string | undefined {
    if (!path.startsWith(PLUGIN)) return undefined;
    const file = path.slice(PLUGIN.length);
    return Object.entries(lanes).find(([, files]) => files.includes(file))?.[0];
}

function owns(entries: readonly Entry[], path: string): boolean {
    const included = entries.some((entry) => (typeof entry === 'string' ? !entry.startsWith('!') && matches(entry, path) : laneKeyOf(path) === entry.lane));
    const excluded = entries.some((entry) => typeof entry === 'string' && entry.startsWith('!') && matches(entry.slice(1), path));
    return included && !excluded;
}

function ownerOf(path: string): string {
    const track = Object.entries(map.tracks).find(([, entries]) => owns(entries, path));
    if (track !== undefined) return track[0];
    const key = laneKeyOf(path);
    return key !== undefined && B_LANE.test(key) ? key : DEFAULT_OWNER;
}

function isTrack(name: string): boolean {
    return branch.kind === 'track' && branch.track === name;
}

function lockedAllows(path: string): boolean {
    if (path === 'bun.lock') return branch.kind === 'track' && branch.deps;
    if (path === '.gitlab-ci.yml' || path === 'ci/tracks.json') return isTrack('FND') || isTrack('CI');
    if (matches('tab-recap/test/fixtures/engine-golden-*.txt', path)) return isTrack('ENG');
    return false;
}

function objectAt(text: string | null): Readonly<Record<string, unknown>> {
    if (text === null) return {};
    try {
        const parsed: unknown = JSON.parse(text);
        return isRecord(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function baseText(path: string): string | null {
    try {
        return execFileSync('git', ['show', `${mergeBase()}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
        return null;
    }
}

function changedFields(path: string): readonly string[] {
    const before = objectAt(baseText(path));
    const after = objectAt(existsSync(path) ? readFileSync(path, 'utf8') : null);
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field])).toSorted();
}

function fieldAllowed(field: string): boolean {
    if (DEPENDENCY_FIELDS.includes(field)) return branch.kind === 'track' && branch.deps;
    if (field === 'version') return branch.kind === 'release';
    if (field === 'scripts' || field === 'exports') return isTrack('FND') || isTrack('CI');
    return true;
}

function isManifest(path: string): boolean {
    return path === 'package.json' || path.endsWith('/package.json');
}

function bLaneTest(path: string): boolean {
    const key = laneKeyOf(path);
    return path.startsWith(`${PLUGIN}test/`) && key !== undefined && B_LANE.test(key);
}

function trackAllows(path: string, track: string): boolean {
    if (ownerOf(path) === track) return true;
    if (Object.entries(map.shared).some(([glob, owners]) => owners.includes(track) && matches(glob, path))) return true;
    return map.open.some((glob) => matches(glob, path)) && (!bLaneTest(path) || track === 'PHB');
}

type Verdict = { readonly path: string; readonly problem: string | null; readonly foreign: boolean };

function verdictOf(path: string): Verdict {
    if (map.locked.some((glob) => matches(glob, path))) {
        return { path, problem: lockedAllows(path) ? null : 'locked', foreign: false };
    }
    const fields = isManifest(path) ? changedFields(path) : [];
    const refused = fields.filter((field) => !fieldAllowed(field));
    if (refused.length > 0) return { path, problem: `changes ${refused.join(', ')} of a package.json`, foreign: false };
    const onlyRuled = isManifest(path) && fields.every((field) => RULED_FIELDS.includes(field));
    if (branch.kind === 'release') return { path, problem: RELEASE_FILES.includes(path) ? null : 'a release branch edits only the release files', foreign: false };
    if (branch.kind !== 'track' || onlyRuled) return { path, problem: null, foreign: false };
    if (trackAllows(path, branch.track)) return { path, problem: null, foreign: false };
    return { path, problem: `owned by ${ownerOf(path)}`, foreign: true };
}

const label = branch.kind === 'track' ? branch.track : branch.kind === 'lane' ? 'PHB (lane)' : branch.kind;
const verdicts = changedFiles().map(verdictOf);
const crossed = verdicts.filter((verdict) => verdict.foreign && crossing);
const stray = verdicts.filter((verdict) => verdict.problem !== null && !(verdict.foreign && crossing));
for (const verdict of stray) process.stderr.write(`  outside track ${label}: ${verdict.path} (${verdict.problem ?? ''})\n`);
for (const verdict of crossed) process.stdout.write(`  crossing ${verdict.path} (${verdict.problem ?? ''})\n`);
process.stdout.write(stray.length === 0 ? `check-track: ${label} clean\n` : `check-track: 1 — ${stray.length} file(s) outside track ${label}\n`);
process.exit(stray.length === 0 ? 0 : 1);
