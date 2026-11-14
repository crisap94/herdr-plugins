import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

interface Options {
    readonly dir: string;
    readonly tagGlob: string;
    readonly base: string;
    readonly tag: string | undefined;
}

interface Run {
    readonly status: number;
    readonly stdout: string;
}

interface Transpiler {
    transformSync(source: string): string;
}

interface BunRuntime {
    readonly Transpiler: new (options: { readonly loader: 'ts'; readonly trimUnusedImports: boolean }) => Transpiler;
}

type Kind = 'untouched' | 'types' | 'modified' | 'deleted';

interface Checked {
    readonly file: string;
    readonly kind: Kind;
}

const CLEAN = 0;
const VIOLATION = 1;
const NOT_COVERED = 3;
const NUMBERED = /\/(\d+)-[^/]*\.ts$/;
const USAGE = 'usage: bun bin/check-migrations.ts --dir <path> --tag-glob <glob> [--base <ref>] [--tag <tag>]';

const transpiler = new (globalThis as unknown as { readonly Bun: BunRuntime }).Bun.Transpiler({ loader: 'ts', trimUnusedImports: false });

const say = (line: string): void => {
    process.stdout.write(`${line}\n`);
};

const warn = (line: string): void => {
    process.stderr.write(`${line}\n`);
};

const git = (args: readonly string[]): Run => {
    const result = spawnSync('git', args, { encoding: 'utf8' });
    return { status: result.status ?? NOT_COVERED, stdout: result.stdout };
};

const linesOf = (text: string): readonly string[] => text.split('\n').filter((line) => line !== '');

const optionsOf = (argv: readonly string[]): Options | null => {
    try {
        const { values } = parseArgs({
            args: [...argv],
            options: { dir: { type: 'string' }, 'tag-glob': { type: 'string' }, base: { type: 'string' }, tag: { type: 'string' } },
            strict: true,
            allowPositionals: false,
        });
        const { dir, 'tag-glob': tagGlob, base = 'origin/main', tag } = values;
        return dir === undefined || tagGlob === undefined ? null : { dir, tagGlob, base, tag };
    } catch {
        return null;
    }
};

const newestTag = (options: Options): string => {
    if (options.tag !== undefined && options.tag !== '') {
        return options.tag;
    }
    return linesOf(git(['tag', '--list', options.tagGlob, '--sort=-v:refname']).stdout)[0] ?? '';
};

const runtimeUnchanged = (tag: string, file: string): boolean => {
    const released = git(['show', `${tag}:${file}`]);
    try {
        return released.status === 0 && transpiler.transformSync(released.stdout) === transpiler.transformSync(readFileSync(file, 'utf8'));
    } catch {
        return false;
    }
};

const kindOf = (tag: string, file: string): Kind => {
    if (!existsSync(file)) {
        return 'deleted';
    }
    if (git(['diff', '--quiet', tag, '--', file]).status === 0) {
        return 'untouched';
    }
    return runtimeUnchanged(tag, file) ? 'types' : 'modified';
};

const reportOf = (tag: string, checked: Checked): readonly string[] => {
    if (checked.kind === 'deleted') {
        return [`  deleted: ${checked.file} (released in ${tag})`];
    }
    if (checked.kind === 'modified') {
        return [`  modified: ${checked.file} (released in ${tag}; the code it runs changed, not only its types)`];
    }
    return [];
};

const releasedUntouched = (options: Options): number => {
    const tag = newestTag(options);
    if (tag === '') {
        say('check-migrations: no release tag yet: nothing is released');
        return CLEAN;
    }
    const released = linesOf(git(['ls-tree', '-r', '--name-only', tag, '--', options.dir]).stdout).filter((file) => !file.endsWith('/index.ts'));
    if (released.length === 0) {
        say(`check-migrations: ${tag} holds no migrations yet: clean`);
        return CLEAN;
    }
    const checked = released.map((file) => ({ file, kind: kindOf(tag, file) }));
    const problems = checked.flatMap((entry) => reportOf(tag, entry));
    problems.forEach(warn);
    if (problems.length > 0) {
        warn('check-migrations: 1 — a released migration changed: add a new numbered migration instead');
        return VIOLATION;
    }
    const types = checked.filter((entry) => entry.kind === 'types').length;
    say(`check-migrations: clean (released in ${tag}: ${released.length} file(s), ${types} with only type changes, the rest untouched)`);
    return CLEAN;
};

const listing = (ref: string, dir: string): readonly string[] => linesOf(git(['ls-tree', '--name-only', ref, '--', `${dir}/`]).stdout);

const numbersOf = (names: readonly string[]): readonly number[] =>
    names
        .flatMap((name) => {
            const digits = NUMBERED.exec(name)?.[1];
            return digits === undefined ? [] : [Number.parseInt(digits, 10)];
        })
        .toSorted((left, right) => left - right);

const missingBase = (base: string): number => {
    if ((process.env['CI'] ?? '') !== '') {
        warn(`check-migrations: 3 — NOT COVERED: the base branch ${base} is not fetched`);
        return NOT_COVERED;
    }
    say(`check-migrations: no base branch ${base} to read: numbering not checked`);
    return CLEAN;
};

const nextNumbers = (options: Options): number => {
    const { base, dir } = options;
    if (git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]).status !== 0) {
        return missingBase(base);
    }
    const onBase = listing(base, dir);
    const highest = numbersOf(onBase).at(-1) ?? 0;
    const known = new Set(onBase);
    const added = numbersOf(listing('HEAD', dir).filter((name) => !known.has(name)));
    if (added.length === 0) {
        say('check-migrations: the branch adds no migration');
        return CLEAN;
    }
    const gap = added.findIndex((number, index) => number !== highest + 1 + index);
    const wrong = added[gap];
    if (wrong !== undefined) {
        warn(`check-migrations: 1 — a migration numbered ${wrong}: the next one is ${highest + 1 + gap} (${base} holds up to ${highest}, and numbers a branch adds follow without a gap)`);
        return VIOLATION;
    }
    say(`check-migrations: the branch adds migrations ${added.join(' ')} after ${base}'s ${highest}: numbering clean`);
    return CLEAN;
};

const main = (): number => {
    const options = optionsOf(process.argv.slice(2));
    if (options === null) {
        warn(`check-migrations: 3 — NOT COVERED: ${USAGE}`);
        return NOT_COVERED;
    }
    const top = git(['rev-parse', '--show-toplevel']);
    if (top.status !== 0) {
        warn('check-migrations: 3 — NOT COVERED: not a git repository');
        return NOT_COVERED;
    }
    process.chdir(top.stdout.trim());
    const released = releasedUntouched(options);
    const numbering = nextNumbers(options);
    if (numbering === NOT_COVERED) {
        return NOT_COVERED;
    }
    return released === CLEAN && numbering === CLEAN ? CLEAN : VIOLATION;
};

process.exit(main());
