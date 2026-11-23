import { stageLine as drawStage } from '@stateforge-labs/recap-view/unstable/compaction-stage.ts';
import type { CompactionRow } from '@stateforge-labs/recap-view';
import type { Style } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import type { Messages } from '#src/i18n/messages.ts';
import type { CompactionRow as LoggedCompaction } from '#src/ports/compaction-records.ts';
import { stageRowOf } from './column.ts';

export { figuresOf, stageClockOf as clockOf } from '@stateforge-labs/recap-view/unstable/compaction-stage.ts';

type StageArgument = Parameters<typeof drawStage>[2];

export interface StagePresented extends StageArgument {}

export interface StageView {
    readonly messages: Messages;
    readonly style: Style;
}

const stageDrawing =
    <Now, Agent, Drawn>(draw: (record: CompactionRow, now: Now, view: StagePresented, agent?: Agent) => Drawn) =>
    (record: LoggedCompaction, now: Now, view: StageView, agent?: Agent): Drawn =>
        draw(stageRowOf(record), now, { wording: view.messages, style: view.style }, agent);

export const stageLine = stageDrawing(drawStage);
