import type { Entry } from '#src/ports/transcripts.ts';

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const TOOLS_SHOWN = 6;

function toolLine(tools: readonly string[]): string {
    const shown = tools.slice(-TOOLS_SHOWN);
    const more = tools.length > shown.length ? ` (+${tools.length - shown.length} more)` : '';
    return `TOOLS: ${shown.join(' | ')}${more}`;
}

function linesOf(entries: readonly Entry[], perEntry: number): string[] {
    const lines: string[] = [];
    let tools: string[] = [];
    for (const entry of entries) {
        if (entry.role === 'tool') {
            tools.push(entry.text);
            continue;
        }
        if (tools.length > 0) {
            lines.push(toolLine(tools));
            tools = [];
        }
        lines.push(`${entry.role === 'user' ? 'USER' : 'AGENT'}: ${clip(entry.text.trim(), perEntry)}`);
    }
    if (tools.length > 0) {
        lines.push(toolLine(tools));
    }
    return lines;
}

/**
 * The excerpt the summarizer reads: prompts, replies, one line per burst of tool calls.
 * Over budget, the most RECENT lines win — the recap already holds the older ones.
 */
export function renderExcerpt(entries: readonly Entry[], budget = 60_000, perEntry = 2_500): string {
    const lines = linesOf(entries, perEntry);
    let total = 0;
    let from = lines.length;
    while (from > 0 && total + (lines[from - 1] ?? '').length + 1 <= budget) {
        total += (lines[from - 1] ?? '').length + 1;
        from--;
    }
    return (from > 0 ? '[…earlier turns omitted…]\n' : '') + lines.slice(from).join('\n');
}
