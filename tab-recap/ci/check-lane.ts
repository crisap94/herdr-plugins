import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { loadLanes, parseLanes, type Lanes } from '../bin/lane-map.ts';

const PREFIX = 'tab-recap/';
const LANES_PATH = `${PREFIX}ci/lanes.json`;
const PIPELINE = '.gitlab-ci.yml';

const adapts = process.env['LANE_ADAPTS'] === '1';
const lane = process.argv[2];
if (lane === undefined) {
    process.stderr.write('check-lane: 3 — NOT COVERED: usage: node ci/check-lane.ts <lane>\n');
    process.exit(3);
}

function changedFiles(): readonly string[] {
    const given = process.env['CHANGED_FILES'];
    if (given !== undefined) return given.split('\n').filter((line) => line !== '');
    const base = process.env['LANE_BASE'] ?? 'origin/main';
    const mergeBase = execFileSync('git', ['merge-base', 'HEAD', base], { encoding: 'utf8' }).trim();
    return execFileSync('git', ['diff', '--name-only', '--no-renames', `${mergeBase}...HEAD`], { encoding: 'utf8' }).split('\n').filter((line) => line !== '');
}

function baseLanes(): Lanes | null {
    const given = process.env['LANES_BASE_FILE'];
    if (given !== undefined) {
        const read = loadLanes(given);
        return read.kind === 'ok' ? read.value : null;
    }
    const base = process.env['LANE_BASE'] ?? 'origin/main';
    try {
        const mergeBase = execFileSync('git', ['merge-base', 'HEAD', base], { encoding: 'utf8' }).trim();
        const parsed = parseLanes(JSON.parse(execFileSync('git', ['show', `${mergeBase}:${LANES_PATH}`], { encoding: 'utf8' })));
        return parsed.kind === 'ok' ? parsed.value : null;
    } catch {
        return null;
    }
}

const loaded = loadLanes(process.env['LANES_FILE'] ?? new URL('./lanes.json', import.meta.url).pathname);
if (loaded.kind === 'err') {
    process.stderr.write(`check-lane: 3 — NOT COVERED: ${loaded.error}\n`);
    process.exit(3);
}
const lanes = loaded.value;
const own = lanes[lane];
if (own === undefined) {
    process.stderr.write(`check-lane: 3 — NOT COVERED: no lane named ${lane} in ci/lanes.json\n`);
    process.exit(3);
}
const ownPaths = new Set(own.map((file) => `${PREFIX}${file}`));
const ownFolders = new Set(own.map((file) => `${PREFIX}${dirname(file)}`));
const otherOwner = new Map(Object.entries(lanes).filter(([name]) => name !== lane).flatMap(([name, files]) => files.map((file): [string, string] => [`${PREFIX}${file}`, name])));

function foreignKeys(): readonly string[] {
    const base = baseLanes();
    if (base === null) return Object.keys(lanes).filter((name) => name !== lane);
    return [...new Set([...Object.keys(base), ...Object.keys(lanes)])].filter((name) => name !== lane && JSON.stringify(base[name]) !== JSON.stringify(lanes[name]));
}

function adaptsForeignSource(file: string): boolean {
    return adapts && otherOwner.has(file) && file.startsWith(`${PREFIX}src/`) && !file.endsWith('/legacy.ts');
}

function allowed(file: string): boolean {
    if (file === PIPELINE) return false;
    if (!file.startsWith(PREFIX)) return true;
    if (file === LANES_PATH) return foreignKeys().length === 0;
    if (file.startsWith(`${PREFIX}test/`) || ownPaths.has(file) || adaptsForeignSource(file)) return true;
    if (file === `${PREFIX}ci/domain-types-baseline/${lane}.json` || file === `${PREFIX}ci/domain-types-exceptions/${lane}.json`) return true;
    return file.endsWith('/legacy.ts') && ownFolders.has(dirname(file));
}

function detailOf(file: string, owner: string | undefined): string {
    if (file === LANES_PATH) return ` (changes the lanes ${foreignKeys().join(', ')})`;
    return owner === undefined ? ' (owned by no lane)' : ` (owned by ${owner})`;
}

const stray = changedFiles().filter((file) => !allowed(file));
for (const file of stray) {
    const owner = otherOwner.get(file);
    process.stderr.write(`  outside lane ${lane}: ${file}${detailOf(file, owner)}\n`);
}
for (const file of changedFiles().filter(adaptsForeignSource)) {
    process.stdout.write(`  adapting ${file} (owned by ${otherOwner.get(file)})\n`);
}
process.stdout.write(stray.length === 0 ? `check-lane: ${lane} clean\n` : `check-lane: 1 — ${stray.length} file(s) outside lane ${lane}\n`);
process.exit(stray.length === 0 ? 0 : 1);
