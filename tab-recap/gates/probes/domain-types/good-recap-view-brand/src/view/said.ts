import type { Seconds, Words } from '@stateforge-labs/recap-view';

export function keepWords(said: Words): Words {
    return said;
}

export function keepSeconds(took: Seconds): Seconds {
    return took;
}
