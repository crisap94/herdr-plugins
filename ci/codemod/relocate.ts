import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';

type Kind = 'drop' | 'path' | 'specifier' | 'text';

type Row = {
    readonly kind: Kind;
    readonly line: number;
    readonly from: string;
    readonly to: string;
    readonly glob: string | null;
};

type Mode = 'dry' | 'check' | 'write';

type Plan = {
    readonly drops: readonly string[];
    readonly moves: ReadonlyMap<string, string>;
    readonly edits: ReadonlyMap<string, string>;
    readonly counts: ReadonlyMap<Row | 'relative', number>;
};

const ORDER: readonly Kind[] = ['drop', 'path', 'specifier', 'text'];
const FIELDS: Readonly<Record<Kind, readonly number[]>> = { drop: [2], path: [3], specifier: [3], text: [3, 4] };
const CODE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/u;
const MANIFEST = /(?:^|\/)(?:tsconfig[^/]*\.json|package\.json)$/u;
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"\n]+)\2/gu;
const SUFFIXES: readonly string[] = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '/index.ts', '/index.js'];
const MODES: Readonly<Record<string, Mode>> = { '--write': 'write', '--check': 'check' };

function notCovered(message: string): never {
    process.stderr.write(`relocate: 3 — NOT COVERED: ${message}\n`);
    process.exit(3);
}

function git(root: string, args: readonly string[]): string {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function under(path: string, prefix: string): boolean {
    return path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

function isKind(word: string): word is Kind {
    return (ORDER as readonly string[]).includes(word);
}

function problemOf(kind: Kind, count: number, from: string, to: string): string | null {
    if (!FIELDS[kind].includes(count)) return `${kind} takes ${FIELDS[kind].join(' or ')} tab-separated fields`;
    if (from === '' || (kind !== 'text' && kind !== 'drop' && to === '')) return 'empty field';
    const loops = kind === 'text' ? to.includes(from) : kind !== 'drop' && under(to, from);
    return loops ? 'the new value contains the old one, so a second run would change it again' : null;
}

function rowOf(fields: readonly string[], line: number, where: string): Row {
    const [kind = '', from = '', to = '', glob] = fields;
    if (!isKind(kind)) return notCovered(`${where}:${line}: unknown row kind "${kind}" (drop, path, specifier, text)`);
    const problem = problemOf(kind, fields.length, from, to);
    if (problem !== null) return notCovered(`${where}:${line}: ${problem}`);
    return { kind, line, from, to, glob: glob ?? null };
}

function readMap(path: string): readonly Row[] {
    if (!existsSync(path)) return notCovered(`no map at ${path}`);
    const rows = readFileSync(path, 'utf8')
        .split('\n')
        .map((text, index) => ({ text: text.replace(/\r$/u, ''), line: index + 1 }))
        .filter(({ text }) => text.trim() !== '')
        .map(({ text, line }) => rowOf(text.split('\t'), line, path));
    return rows.toSorted((left, right) => ORDER.indexOf(left.kind) - ORDER.indexOf(right.kind));
}

function escaped(text: string): string {
    return text.replace(/[.+?^$()|[\]\\*{}]/gu, '\\$&');
}

function globMatches(glob: string, path: string): boolean {
    const source = glob
        .split('**')
        .map((part) =>
            escaped(part)
                .replace(/\\\*/gu, '[^/]*')
                .replace(/\\\{([^}]*)\\\}/gu, (_all, list: string) => `(?:${list.split(',').join('|')})`),
        )
        .join('.*');
    return new RegExp(`^${source}$`, 'u').test(glob.includes('/') ? path : posix.basename(path));
}

function mapperOf(rows: readonly Row[]): (path: string) => string {
    const moves = rows.filter((row) => row.kind === 'path');
    return (path) => {
        const row = moves.find((candidate) => under(path, candidate.from));
        return row === undefined ? path : row.to + path.slice(row.from.length);
    };
}

function movedTarget(target: string, mapPath: (path: string) => string): string {
    for (const suffix of SUFFIXES) {
        const moved = mapPath(target + suffix);
        if (moved !== target + suffix && moved.endsWith(suffix)) return moved.slice(0, moved.length - suffix.length);
    }
    if (!target.endsWith('.js')) return target;
    const source = `${target.slice(0, -3)}.ts`;
    const moved = mapPath(source);
    return moved !== source && moved.endsWith('.ts') ? `${moved.slice(0, -3)}.js` : target;
}

function relativeSpecifier(spec: string, origin: string, final: string, mapPath: (path: string) => string): string {
    if (!spec.startsWith('./') && !spec.startsWith('../')) return spec;
    const target = posix.normalize(posix.join(posix.dirname(origin), spec));
    if (target.startsWith('../')) return spec;
    const moved = movedTarget(target, mapPath);
    if (moved === target && origin === final) return spec;
    const next = posix.relative(posix.dirname(final), moved) || '.';
    const dotted = next.startsWith('.') ? next : `./${next}`;
    return spec.endsWith('/') && !dotted.endsWith('/') ? `${dotted}/` : dotted;
}

function rewriteSpecifiers(content: string, rewrite: (spec: string) => string): string {
    return content.replace(SPECIFIER, (all, lead: string, quote: string, spec: string) => {
        const next = rewrite(spec);
        return next === spec ? all : `${lead}${quote}${next}${quote}`;
    });
}

function prefixed(spec: string, row: Row): string {
    return under(spec, row.from) ? row.to + spec.slice(row.from.length) : spec;
}

function recordOf(input: unknown): Readonly<Record<string, unknown>> {
    return typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function manifestKeys(content: string, file: string): readonly string[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch (error) {
        return notCovered(`${file}: ${String(error)}`);
    }
    const top = recordOf(parsed);
    const table = file.endsWith('package.json') ? top['imports'] : recordOf(top['compilerOptions'])['paths'];
    return Object.keys(recordOf(table));
}

function rewriteManifest(content: string, file: string, row: Row): string {
    if (!content.includes(row.from)) return content;
    return manifestKeys(content, file)
        .filter((key) => prefixed(key, row) !== key)
        .reduce((text, key) => text.replace(new RegExp(`${escaped(JSON.stringify(key))}(\\s*:)`, 'gu'), `${JSON.stringify(prefixed(key, row))}$1`), content);
}

function applyRow(content: string, file: string, row: Row): string {
    if (row.kind === 'text') return row.glob === null || globMatches(row.glob, file) ? content.split(row.from).join(row.to) : content;
    if (MANIFEST.test(file)) return rewriteManifest(content, file, row);
    return CODE.test(file) ? rewriteSpecifiers(content, (spec) => prefixed(spec, row)) : content;
}

function textOf(root: string, file: string): string | null {
    const bytes = readFileSync(resolve(root, file));
    return bytes.includes(0) ? null : bytes.toString('utf8');
}

function bump(counts: Map<Row | 'relative', number>, key: Row | 'relative'): void {
    counts.set(key, (counts.get(key) ?? 0) + 1);
}

type Rewriter = {
    readonly rows: readonly Row[];
    readonly moving: boolean;
    readonly mapPath: (path: string) => string;
    readonly counts: Map<Row | 'relative', number>;
};

function rewritten(original: string, final: string, origin: string, rewriter: Rewriter): string {
    let content = original;
    if (rewriter.moving && CODE.test(final)) {
        content = rewriteSpecifiers(content, (spec) => relativeSpecifier(spec, origin, final, rewriter.mapPath));
        if (content !== original) bump(rewriter.counts, 'relative');
    }
    for (const row of rewriter.rows) {
        const next = applyRow(content, final, row);
        if (next !== content) bump(rewriter.counts, row);
        content = next;
    }
    return content;
}

function editsOf(root: string, rows: readonly Row[], files: ReadonlyMap<string, string>, counts: Map<Row | 'relative', number>): Map<string, string> {
    const rewriter: Rewriter = {
        rows: rows.filter((row) => row.kind === 'specifier' || row.kind === 'text'),
        moving: rows.some((row) => row.kind === 'path'),
        mapPath: mapperOf(rows),
        counts,
    };
    const edits = new Map<string, string>();
    for (const [final, origin] of files) {
        if (rewriter.rows.length === 0 && !(rewriter.moving && CODE.test(final))) continue;
        const original = textOf(root, origin);
        if (original === null) continue;
        const content = rewritten(original, final, origin, rewriter);
        if (content !== original) edits.set(final, content);
    }
    return edits;
}

function planOf(root: string, rows: readonly Row[], tracked: readonly string[]): Plan {
    const counts = new Map<Row | 'relative', number>();
    const drops = tracked.filter((file) => rows.some((row) => row.kind === 'drop' && under(file, row.from)));
    for (const row of rows.filter((candidate) => candidate.kind === 'drop')) counts.set(row, drops.filter((file) => under(file, row.from)).length);
    const live = tracked.filter((file) => !drops.includes(file));
    const mapPath = mapperOf(rows);
    const moves = new Map(live.filter((file) => mapPath(file) !== file).map((file) => [file, mapPath(file)]));
    for (const row of rows.filter((candidate) => candidate.kind === 'path')) counts.set(row, [...moves.keys()].filter((file) => under(file, row.from)).length);
    const clash = [...moves.values()].find((target) => existsSync(resolve(root, target)) && !moves.has(target));
    if (clash !== undefined) return notCovered(`${clash} already exists`);
    const finals = new Map(live.map((file) => [moves.get(file) ?? file, file]));
    if (finals.size !== live.length) return notCovered('two files would land on the same path');
    return { drops, moves, edits: editsOf(root, rows, finals, counts), counts };
}

function write(root: string, plan: Plan): void {
    if (plan.drops.length > 0) git(root, ['rm', '-q', '--', ...plan.drops]);
    for (const [from, to] of plan.moves) {
        mkdirSync(posix.dirname(resolve(root, to)), { recursive: true });
        git(root, ['mv', '--', from, to]);
    }
    for (const [file, content] of plan.edits) writeFileSync(resolve(root, file), content);
    if (plan.edits.size > 0) git(root, ['add', '--', ...plan.edits.keys()]);
}

function report(rows: readonly Row[], plan: Plan): number {
    const lines = rows.map((row) => `${[row.kind, row.from, row.to, row.glob ?? ''].filter((part) => part !== '').join(' ')}: ${plan.counts.get(row) ?? 0}`);
    lines.push(`relative: ${plan.counts.get('relative') ?? 0}`);
    process.stdout.write(`${lines.join('\n')}\n`);
    return [...plan.counts.values()].reduce((sum, count) => sum + count, 0);
}

function main(argv: readonly string[]): number {
    const [mapArg, flag, extra] = argv;
    const mode = flag === undefined ? 'dry' : MODES[flag];
    if (mapArg === undefined || mode === undefined || extra !== undefined) return notCovered('usage: bun ci/codemod/relocate.ts <map.tsv> [--write|--check]');
    const rows = readMap(resolve(mapArg));
    const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
    const tracked = git(root, ['ls-files', '-z']).split('\0').filter((file) => file !== '' && existsSync(resolve(root, file)) && lstatSync(resolve(root, file)).isFile());
    const plan = planOf(root, rows, tracked);
    const total = report(rows, plan);
    if (mode === 'write') write(root, plan);
    process.stdout.write(`${total} ${mode === 'write' ? 'written' : 'pending'}\n`);
    return mode === 'check' && total > 0 ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
