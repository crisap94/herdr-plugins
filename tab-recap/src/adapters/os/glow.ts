import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

export function trimPadding(line: string): string {
    const shown = stripVTControlCharacters(line).trimEnd();
    let end = 0;
    while (stripVTControlCharacters(line.slice(0, end)) !== shown) {
        end++;
    }
    return `${line.slice(0, end)}${line.slice(end).replaceAll(' ', '')}`;
}

export type MarkdownRenderer = (markdown: string, width: number) => readonly string[] | null;

export function glowRenderer(mode: 'auto' | 'on' | 'off'): MarkdownRenderer {
    if (mode === 'off') {
        return () => null;
    }
    const probe = spawnSync('glow', ['--version'], { encoding: 'utf8' });
    if (probe.status !== 0) {
        return () => null;
    }
    return (markdown, width) => {
        const ran = spawnSync('glow', ['-s', 'dark', '-w', String(Math.max(20, width)), '-'], { input: markdown, encoding: 'utf8', timeout: 5000 });
        return ran.status === 0 ? ran.stdout.replace(/\n+$/, '').split('\n').map(trimPadding) : null;
    };
}
