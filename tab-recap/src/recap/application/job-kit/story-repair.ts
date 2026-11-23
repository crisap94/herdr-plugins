import { must } from '#src/protocol/result.ts';
import type { Curated, Curators } from '#src/ports/curators.ts';
import type { CurationRun } from '#src/ports/stories.ts';
import type { Result } from '#src/protocol/result.ts';
import type { Curation } from '#src/recap/domain/curation.ts';
import { STORY_TOO_LONG } from '#src/recap/domain/curation.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseText, textOf } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { ReconcilingDeps } from '@stateforge-labs/session-ledger/unstable/recap/application/ledger-reconcile.ts';

export type StoryReading = (answer: Curated) => Curation;

export interface StoryRound {
    readonly writer: Curators;
    readonly run: CurationRun;
    readonly sent: Result<Text, ParseFailure>;
    readonly first: Curated;
    readonly reading: StoryReading;
}

export function storyRepair(document: Text, answer: Text, checked: Curation): Text {
    const lines = [document, '', '<previous-answer>', answer, '</previous-answer>', '', '<refused>'];
    let tooLong = false;
    for (const why of checked.refused) {
        lines.push(`- ${why}`);
        tooLong = tooLong || why.startsWith(STORY_TOO_LONG);
    }
    if (checked.story === null && !tooLong) {
        lines.push('- no paragraph');
    }
    lines.push('</refused>', '', 'Your previous answer, in <previous-answer>, had problems, listed in <refused>. Answer again with the whole JSON object: keep the merges that were not refused, fix or leave out each refused one, and write the paragraph.');
    const built = parseText(lines.join('\n'));
    return built.kind === 'ok' ? built.value : document;
}

function acceptedOf(round: StoryRound, repair: Curated): Curated {
    if (repair.kind !== 'curated') {
        return round.first;
    }
    const rechecked = round.reading(repair).refused;
    return rechecked.includes(textOf('the answer is not JSON')) || rechecked.includes(textOf('the answer is not an object')) ? round.first : repair;
}

export async function storyAnswerOf(deps: ReconcilingDeps, round: StoryRound): Promise<Curated> {
    if (deps.repair?.() !== 'once' || round.first.kind !== 'curated') {
        return round.first;
    }
    const checked = round.reading(round.first);
    if (checked.refused.length === 0 && checked.story !== null) {
        return round.first;
    }
    const said = parseText(round.first.text);
    if (round.sent.kind === 'err' || said.kind === 'err') {
        return round.first;
    }
    const where = `curator ${round.run.task.tab} ${round.run.task.key}`;
    deps.log(must(parseText(`${where}: story repair — ${checked.refused.length} refused`)));
    return acceptedOf(round, await round.writer.write(storyRepair(round.sent.value, said.value, checked)));
}
