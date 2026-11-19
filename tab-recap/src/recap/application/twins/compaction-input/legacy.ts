import type { HistoryFact } from '#src/ports/ledger.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { compactionMaterialInput } from '../../compaction-material.ts';

export interface MaterialAgent {
    readonly kind: string;
    readonly label: string;
    readonly repo: string | null;
    readonly branch: string | null;
}

export interface MaterialClock {
    readonly now: number;
    readonly zone: string;
}

export interface CompactionMaterial {
    readonly agent: MaterialAgent;
    readonly note: string | null;
    readonly current: RecapSections;
    readonly history: readonly HistoryFact[];
    readonly lastBreakAt: number | null;
    readonly recent: readonly Entry[];
    readonly clock: MaterialClock;
}

const textOf = (raw: string): Text => must(parseText(raw));
const optionalOf = (raw: string | null): Text | null => (raw === null ? null : textOf(raw));

export function compactionInput(material: CompactionMaterial): Text {
    const { agent, clock } = material;
    return compactionMaterialInput({
        agent: { kind: textOf(agent.kind), label: textOf(agent.label), repo: optionalOf(agent.repo), branch: optionalOf(agent.branch) },
        note: optionalOf(material.note),
        current: material.current,
        history: material.history,
        lastBreakAt: material.lastBreakAt === null ? null : instant(material.lastBreakAt),
        recent: material.recent,
        clock: { now: instant(clock.now), zone: textOf(clock.zone) },
    });
}
