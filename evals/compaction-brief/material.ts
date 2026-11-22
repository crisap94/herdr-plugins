import { compactionMaterialInput, type CompactionMaterial as TypedMaterial } from '../../tab-recap/src/recap/application/compaction-material.ts';
import { textOf } from '../../tab-recap/src/recap/domain/text.ts';
import { instant } from '../../tab-recap/src/recap/domain/time.ts';

export interface CompactionMaterial extends Omit<TypedMaterial, 'agent' | 'note' | 'lastBreakAt' | 'clock'> {
    readonly agent: { readonly kind: string; readonly label: string; readonly repo: string | null; readonly branch: string | null };
    readonly note: string | null;
    readonly lastBreakAt: number | null;
    readonly clock: { readonly now: number; readonly zone: string };
}

const optionalText = (raw: string | null): TypedMaterial['note'] => (raw === null ? null : textOf(raw));

export const compactionInput = (material: CompactionMaterial): string => compactionMaterialInput({
    ...material,
    agent: { kind: textOf(material.agent.kind), label: textOf(material.agent.label), repo: optionalText(material.agent.repo), branch: optionalText(material.agent.branch) },
    note: optionalText(material.note),
    lastBreakAt: material.lastBreakAt === null ? null : instant(material.lastBreakAt),
    clock: { now: instant(material.clock.now), zone: textOf(material.clock.zone) },
});
