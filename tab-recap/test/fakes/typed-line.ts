import type { CompactionLine } from '#src/recap/domain/compaction-plan.ts';
import type { Prompted } from '#src/ports/agents.ts';
import { unknown } from '#src/ports/unknowable.ts';

export function lineBreakRefusal(line: CompactionLine): Prompted | null {
    return line.pieces.some((piece) => /[\r\n]/u.test(piece)) ? unknown({ why: 'unreadable', detail: 'a typed line has no line break' }) : null;
}
