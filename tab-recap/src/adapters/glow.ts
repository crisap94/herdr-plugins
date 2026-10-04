// Renders Markdown through glow when it is installed; the column falls back to its own
// renderer otherwise. An explicit style is required: glow prints plain text when captured.
import { spawnSync } from 'node:child_process';

const CSI = `${String.fromCodePoint(0x1b)}[`;
const SGR_BODY = new Set('0123456789;');

function endsWithSgr(text: string): number {
    const at = text.lastIndexOf(CSI);
    if (at < 0 || !text.endsWith('m')) {
        return -1;
    }
    const body = text.slice(at + CSI.length, -1);
    for (let i = 0; i < body.length; i++) {
        if (!SGR_BODY.has(body.charAt(i))) {
            return -1;
        }
    }
    return at;
}

/** glow pads every line to the full width with spaces (inside trailing colour codes); drop the padding. */
export function trimPadding(line: string): string {
    let rest = line;
    let tail = '';
    for (;;) {
        const at = endsWithSgr(rest);
        if (at >= 0) {
            tail = rest.slice(at) + tail;
            rest = rest.slice(0, at);
        } else if (rest.endsWith(' ')) {
            rest = rest.trimEnd();
        } else {
            return rest + tail;
        }
    }
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
