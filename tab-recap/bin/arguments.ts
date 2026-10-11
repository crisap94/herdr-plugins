import { parseArgs } from 'node:util';
import { handoffArgumentsOf, type HandoffArguments } from './handoff.ts';

const HANDOFF_ONLY = ['from', 'to', 'print', 'refresh', 'from-closed', 'closed-at', 'list-closed'] as const;

interface ParsedArguments {
    readonly positionals: string[];
    readonly note: string | undefined;
    readonly handoff: HandoffArguments | null;
}

export function parseArguments(argv: readonly string[]): ParsedArguments | { problem: string } {
    try {
        const { values, positionals } = parseArgs({ args: [...argv], allowPositionals: true, strict: true, options: { help: { type: 'boolean', short: 'h' }, note: { type: 'string' }, from: { type: 'string', multiple: true }, to: { type: 'string', multiple: true }, print: { type: 'boolean' }, refresh: { type: 'boolean' }, 'from-closed': { type: 'string', multiple: true }, tab: { type: 'string', multiple: true }, 'closed-at': { type: 'string', multiple: true }, 'list-closed': { type: 'boolean' } } });
        const [name] = positionals;
        const misplaced = HANDOFF_ONLY.find((option) => values[option] !== undefined);
        if (misplaced !== undefined && name !== 'handoff') {
            return { problem: `--${misplaced} applies to handoff only` };
        }
        if (values.tab !== undefined && name !== 'handoff') {
            return { problem: '--tab applies to handoff and eval only' };
        }
        if (values.note !== undefined && name !== 'compact' && name !== 'handoff') {
            return { problem: '--note applies to compact and handoff only' };
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
