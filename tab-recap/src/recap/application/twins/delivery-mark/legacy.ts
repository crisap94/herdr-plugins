import { DeliveryTracker, type Abandoned } from '../../delivery-tracker.ts';

export type { Abandoned, DeliveryPhase } from '../../delivery-tracker.ts';

export class DeliveryMark {
    private readonly tracker = new DeliveryTracker();

    claim(): boolean {
        return this.tracker.claim() === 'present';
    }

    startTyping(): boolean {
        return this.tracker.startTyping() === 'present';
    }

    settle(): boolean {
        return this.tracker.settle() === 'present';
    }

    abandon(): Abandoned {
        return this.tracker.abandon();
    }
}
