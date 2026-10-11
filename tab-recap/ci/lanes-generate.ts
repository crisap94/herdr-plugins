import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const LANES = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'] as const;
const TEST_PRIORITY = ['B2', 'B1', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'] as const;
const LEAD = 'lead';

type Lane = typeof LANES[number] | typeof LEAD;

const ROOT = new URL('../', import.meta.url).pathname;

const FOLDER_LANES: readonly (readonly [string, Lane])[] = [
    ['src/protocol/', 'B1'],
    ['src/ports/', 'B1'],
    ['src/recap/domain/', 'B2'],
    ['src/recap/application/', 'B3'],
    ['src/recap/render/', 'B4'],
    ['src/i18n/', 'B4'],
    ['src/column/', 'B4'],
    ['src/adapters/db/', 'B5'],
    ['src/adapters/', 'B6'],
    ['src/daemon/', 'B7'],
    ['src/extensions/', 'B7'],
    ['src/compact/', 'B7'],
    ['src/setup/', 'B7'],
    ['src/transport/', 'B7'],
    ['src/experiment/', 'B8'],
];

const SKIP_LIST = process.env['LANES_SKIP_LIST'] ?? join(ROOT, 'ci/atalaya-files.txt');
const REPOSITORY_PREFIX = 'tab-recap/';

function skippedPaths(): readonly string[] {
    if (!existsSync(SKIP_LIST)) return [];
    return readFileSync(SKIP_LIST, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#') && line.startsWith(REPOSITORY_PREFIX)).map((line) => line.slice(REPOSITORY_PREFIX.length));
}

const SKIPPED = skippedPaths();

function skipped(file: string): boolean {
    return SKIPPED.some((path) => (path.endsWith('/') ? file.startsWith(path) : file === path));
}

function filesUnder(folder: string): readonly string[] {
    const found: string[] = [];
    const walk = (directory: string): void => {
        for (const entry of readdirSync(directory, { withFileTypes: true, encoding: 'utf8' })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules') walk(path);
            } else {
                if (!skipped(relative(ROOT, path))) found.push(relative(ROOT, path));
            }
        }
    };
    walk(join(ROOT, folder));
    return found.toSorted();
}

function laneOfSource(file: string): Lane {
    const found = FOLDER_LANES.find(([prefix]) => file.startsWith(prefix));
    return found === undefined ? LEAD : found[1];
}

function basenameOf(file: string): string {
    return file.slice(file.lastIndexOf('/') + 1).replace(/\.[^.]+$/u, '');
}

function importedSources(file: string): readonly string[] {
    const text = readFileSync(join(ROOT, file), 'utf8');
    return [...text.matchAll(/['"]#src\/([^'"]+)['"]/gu)].map((match) => `src/${match[1] ?? ''}`);
}

function laneOfTest(file: string, sourceByBasename: ReadonlyMap<string, string>): Lane {
    if (file.startsWith('test/fakes/') || file.startsWith('test/fixtures/')) return LEAD;
    const stem = basenameOf(file).replace(/\.test$/u, '');
    const named = sourceByBasename.get(stem);
    if (named !== undefined) return laneOfSource(named);
    const lanes = new Set(importedSources(file).map(laneOfSource));
    const first = TEST_PRIORITY.find((lane) => lanes.has(lane));
    return first ?? LEAD;
}

function build(): Readonly<Record<Lane, readonly string[]>> {
    const sources = filesUnder('src');
    const sourceByBasename = new Map<string, string>();
    const duplicated = new Set<string>();
    for (const file of sources) {
        const stem = basenameOf(file);
        if (sourceByBasename.has(stem)) duplicated.add(stem);
        sourceByBasename.set(stem, file);
    }
    for (const stem of duplicated) sourceByBasename.delete(stem);
    const lanes: Record<Lane, string[]> = { B1: [], B2: [], B3: [], B4: [], B5: [], B6: [], B7: [], B8: [], lead: [] };
    for (const file of sources) lanes[laneOfSource(file)].push(file);
    for (const file of filesUnder('test')) lanes[laneOfTest(file, sourceByBasename)].push(file);
    for (const lane of Object.keys(lanes) as Lane[]) lanes[lane].sort();
    return lanes;
}

const target = process.env['LANES_FILE'] ?? join(ROOT, 'ci/lanes.json');
const built = build();
const fresh = `${JSON.stringify({ lanes: built }, null, 2)}\n`;

function listed(text: string): readonly string[] {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || !('lanes' in parsed) || typeof parsed.lanes !== 'object' || parsed.lanes === null) return [];
    return Object.values(parsed.lanes).flatMap((files: unknown) => (Array.isArray(files) ? files.filter((file): file is string => typeof file === 'string') : []));
}

function problems(current: string): readonly string[] {
    const files = listed(current);
    const counts = new Map<string, number>();
    for (const file of files) counts.set(file, (counts.get(file) ?? 0) + 1);
    const expected = new Set(Object.values(built).flat());
    return [
        ...[...counts].filter(([, count]) => count > 1).map(([file]) => `listed twice: ${file}`),
        ...[...expected].filter((file) => !counts.has(file)).map((file) => `missing: ${file}`),
        ...[...counts.keys()].filter((file) => !expected.has(file)).map((file) => `no such file: ${file}`),
    ];
}

if (process.argv.includes('--check')) {
    const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
    const found = current === '' ? ['ci/lanes.json is absent'] : problems(current);
    for (const line of found) process.stderr.write(`lanes: ${line}\n`);
    if (found.length === 0 && current !== fresh) process.stderr.write('lanes: ci/lanes.json differs from the generated map: run node ci/lanes-generate.ts\n');
    process.exit(found.length === 0 && current === fresh ? 0 : 1);
}
writeFileSync(target, fresh);
