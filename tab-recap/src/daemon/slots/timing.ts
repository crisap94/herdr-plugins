import type { LedgerEvent } from '@stateforge-labs/session-ledger';
import type { Candidate } from '@stateforge-labs/session-ledger/compaction-timing';
import type { Mode, Running, SlotContext, SlotModule } from '../slots.ts';

export const defaultOn: Mode = 'off';

export const slot: SlotModule = {
    start: async (context: SlotContext): Promise<Running> => {
        const slots = await import('../slots.ts');
        const considerAll = async (scoped: readonly Candidate[]): Promise<void> => {
            await Promise.all(scoped.map(async (candidate): Promise<void> => {
                try {
                    await context.consider(candidate);
                } catch (error) {
                    context.log(slots.parseLine(`timing: ${slots.parseMessage(error)}`));
                }
            }));
        };
        const stopListening = context.ledger((event: LedgerEvent): void => {
            if (event.kind !== 'accomplishment-established') return;
            void considerAll(context.candidates().filter((candidate) => candidate.scope === event.scope));
        });
        return { stop: (): void => { stopListening(); } };
    },
};
