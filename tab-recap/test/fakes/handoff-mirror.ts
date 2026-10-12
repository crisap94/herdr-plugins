import { HandoffMirror } from '#src/recap/application/handoff-mirror.ts';
import { MemoryAskLedger } from './ask-ledger.ts';
import { RecordingTokens } from './lane-tokens.ts';

export function silentMirror(): HandoffMirror {
    return new HandoffMirror({
        asks: new MemoryAskLedger(),
        tokens: new RecordingTokens(),
        events: { lane: (): void => undefined, inWorkspace: (): void => undefined },
        sharing: (): 'off' => 'off',
        log: (): void => undefined,
    });
}
