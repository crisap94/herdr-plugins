import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { loadLanes } from '../bin/lane-map.ts';

const PREFIX = 'tab-recap/';

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
    return execFileSync('git', ['diff', '--name-only', `${mergeBase}...HEAD`], { encoding: 'utf8' }).split('\n').filter((line) => line !== '');
}

const loaded = loadLanes(new URL('./lanes.json', import.meta.url).pathname);
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

function allowed(file: string): boolean {
    if (!file.startsWith(PREFIX)) return true;
    if (ownPaths.has(file)) return true;
    if (file === `${PREFIX}ci/domain-types-baseline/${lane}.json` || file === `${PREFIX}ci/domain-types-exceptions/${lane}.json`) return true;
    return file.endsWith('/legacy.ts') && ownFolders.has(dirname(file));
}

const stray = changedFiles().filter((file) => !allowed(file));
for (const file of stray) {
    const owner = otherOwner.get(file);
    process.stderr.write(`  outside lane ${lane}: ${file}${owner === undefined ? ' (owned by no lane)' : ` (owned by ${owner})`}\n`);
}
process.stdout.write(stray.length === 0 ? `check-lane: ${lane} clean\n` : `check-lane: 1 — ${stray.length} file(s) outside lane ${lane}\n`);
process.exit(stray.length === 0 ? 0 : 1);
