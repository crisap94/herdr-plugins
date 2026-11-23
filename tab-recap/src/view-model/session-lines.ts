import { sessionLines as drawLines } from '@stateforge-labs/recap-view/unstable/session-lines.ts';
import type { SessionContext } from '@stateforge-labs/recap-view/unstable/session-lines.ts';
import type { SessionRecap } from '@stateforge-labs/recap-view';
import type { Messages } from '#src/i18n/messages.ts';
import type { SessionFacts } from '#src/recap/domain/session-facts.ts';
import { sessionRecapOf } from './expanded.ts';
import { wordingOf } from './wording.ts';

export { spanOf } from '@stateforge-labs/recap-view/unstable/session-lines.ts';

export interface PluginSessionContext extends Omit<SessionContext, 'wording'> {
    readonly messages: Messages;
}

export interface SessionPresented extends SessionContext {}

const linesDrawing =
    <Drawn>(draw: (facts: SessionRecap, context: SessionPresented) => Drawn) =>
    (facts: SessionFacts, context: PluginSessionContext): Drawn =>
        draw(sessionRecapOf(facts), { now: context.now, zone: context.zone, wording: wordingOf(context.messages) });

export const sessionLines = linesDrawing(drawLines);
