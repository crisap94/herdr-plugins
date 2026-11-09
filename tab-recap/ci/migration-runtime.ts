import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const transpiler = new Bun.Transpiler({ loader: 'ts', trimUnusedImports: true });
const runtimeOf = (source: string): string => transpiler.transformSync(source);

const [tag, file] = process.argv.slice(2);
if (tag === undefined || file === undefined) {
    process.stderr.write('migration-runtime: usage: bun ci/migration-runtime.ts <tag> <file>\n');
    process.exit(3);
}
const released = execFileSync('git', ['show', `${tag}:${file}`], { encoding: 'utf8' });
process.exit(runtimeOf(released) === runtimeOf(readFileSync(file, 'utf8')) ? 0 : 1);
