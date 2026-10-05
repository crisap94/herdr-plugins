// Turn a rendered release into file edits: the three versions, the CHANGELOG section, its link refs.
//   node ci/apply-release.ts <plugin-dir> <version> <section-file> <previous-tag>
// The CHANGELOG is the repository's, one level above the plugin directory.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sameVersion = (text: string, version: string): string => text.replace(/^version = "[^"]*"/m, `version = "${version}"`);

/** package.json / package-lock.json: the version, and the lockfile's root package, keep npm's own layout. */
export function withJsonVersion(text: string, version: string): string {
    const json = JSON.parse(text) as { version: string; packages?: Record<string, { version?: string }> };
    json.version = version;
    const root = json.packages?.[''];
    if (root !== undefined) {
        root.version = version;
    }
    return `${JSON.stringify(json, null, 2)}\n`;
}

/** The plugin's part of the CHANGELOG, as [start, end) line numbers. */
function partOf(lines: readonly string[], plugin: string): readonly [number, number] {
    const start = lines.indexOf(`## ${plugin}`);
    if (start < 0) {
        throw new Error(`CHANGELOG has no '## ${plugin}'`);
    }
    const next = lines.findIndex((line, at) => at > start && line.startsWith('## '));
    return [start, next < 0 ? lines.length : next];
}

export function withRelease(changelog: string, plugin: string, version: string, section: string, previous: string): string {
    const lines = changelog.split('\n');
    const [start, end] = partOf(lines, plugin);
    const heading = lines.findIndex((line, at) => at > start && at < end && line === '### [Unreleased]');
    const nextHeading = lines.findIndex((line, at) => at > heading && at < end && /^(### \[|\[[^\]]+\]: )/.test(line));
    if (heading < 0 || nextHeading < 0) {
        throw new Error(`CHANGELOG has no '### [Unreleased]' followed by a version or link references under '## ${plugin}'`);
    }
    if (lines.slice(heading + 1, nextHeading).some((line) => line.trim() !== '')) {
        throw new Error('### [Unreleased] holds text: entries come from the merge request titles, so it must be empty');
    }
    const unreleased = lines.findIndex((line, at) => at > start && at < end && line.startsWith('[Unreleased]: '));
    const old = lines[unreleased] ?? '';
    const base = old.slice('[Unreleased]: '.length).replace(/\/compare\/.*$/, '');
    if (unreleased < 0 || !old.includes('/compare/')) {
        throw new Error('CHANGELOG has no [Unreleased] compare link to update');
    }
    const refs = [`[Unreleased]: ${base}/compare/${plugin}-v${version}...HEAD`, `[${version}]: ${base}/compare/${previous}...${plugin}-v${version}`];
    const out = [...lines];
    out.splice(unreleased, 1, ...refs);
    out.splice(heading + 1, 0, '', ...section.split('\n'));
    return out.join('\n').replace(/\n{3,}(?=### \[)/g, '\n\n');
}

function edit(file: string, change: (text: string) => string): void {
    writeFileSync(file, change(readFileSync(file, 'utf8')));
}

function main(): void {
    const [dir, version, sectionFile, previous] = process.argv.slice(2);
    if (dir === undefined || version === undefined || sectionFile === undefined || previous === undefined) {
        throw new Error('usage: apply-release.ts <plugin-dir> <version> <section-file> <previous-tag>');
    }
    const plugin = readFileSync(join(dir, 'herdr-plugin.toml'), 'utf8').match(/^id = "([^"]+)"/m)?.[1] ?? '';
    edit(join(dir, 'herdr-plugin.toml'), (text) => sameVersion(text, version));
    edit(join(dir, 'package.json'), (text) => withJsonVersion(text, version));
    edit(join(dir, 'package-lock.json'), (text) => withJsonVersion(text, version));
    edit(join(dir, '..', 'CHANGELOG.md'), (text) => withRelease(text, plugin, version, readFileSync(sectionFile, 'utf8').trimEnd(), previous));
}

if (import.meta.main) {
    try {
        main();
    } catch (error: unknown) {
        process.stderr.write(`apply-release: 1 — ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
