import { parseArgs } from 'node:util';
import { handoffArgumentsOf, type HandoffArguments } from './handoff.ts';

const HANDOFF_ONLY = ['from', 'to', 'print', 'refresh', 'from-closed', 'closed-at', 'list-closed'] as const;

interface ParsedArguments {
    readonly positionals: string[];
    readonly note: string | undefined;
    readonly handoff: HandoffArguments | null;
}

const OPTIONS = { help: { type: 'boolean', short: 'h' }, note: { type: 'string' }, from: { type: 'string', multiple: true }, to: { type: 'string', multiple: true }, print: { type: 'boolean' }, refresh: { type: 'boolean' }, 'from-closed': { type: 'string', multiple: true }, tab: { type: 'string', multiple: true }, 'closed-at': { type: 'string', multiple: true }, 'list-closed': { type: 'boolean' } } as const;

function handoffOnlyProblem(values: Readonly<Record<string, unknown>>, name: string | undefined): string | null {
    const misplaced = HANDOFF_ONLY.find((option) => values[option] !== undefined);
    return misplaced !== undefined && name !== 'handoff' ? `--${misplaced} applies to handoff only` : null;
}

function placementProblem(values: Readonly<Record<string, unknown>>, name: string | undefined): string | null {
    if (values.tab !== undefined && name !== 'handoff') {
        return '--tab applies to handoff and eval only';
    }
    return values.note !== undefined && name !== 'compact' && name !== 'handoff' ? '--note applies to compact and handoff only' : null;
}

export function parseArguments(argv: readonly string[]): ParsedArguments | { problem: string } {
    try {
        const { values, positionals } = parseArgs({ args: [...argv], allowPositionals: true, strict: true, options: OPTIONS });
        const [name] = positionals;
        const problemText = handoffOnlyProblem(values, name) ?? placementProblem(values, name);
        if (problemText !== null) {
            return { problem: problemText };
        }
        if (name !== 'handoff') {
            return { positionals, note: values.note, handoff: null };
        }
        const handoff = handoffArgumentsOf(values, positionals);
        return 'problem' in handoff ? handoff : { positionals, note: values.note, handoff };
    } catch (error) {
        return { problem: error instanceof Error ? error.message : String(error) };
    }
}
