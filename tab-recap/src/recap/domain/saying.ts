import { saying as engineSaying, textOf } from '@stateforge-labs/session-ledger';
import type { Text, Unknown } from '@stateforge-labs/session-ledger';

export function saying(unknowable: Unknown['why']): Text {
    if (unknowable.why === 'lease') {
        return textOf(`another tool is typing into the pane (waited ${unknowable.after} ms for its lease)`);
    }
    return engineSaying(unknowable);
}
