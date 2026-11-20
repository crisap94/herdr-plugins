import type { Presence } from '#src/recap/domain/presence.ts';

export type DeliveryPhase = 'open' | 'claimed' | 'typed' | 'closed';

export type Abandoned = 'typed' | 'claimed' | 'none';

export class DeliveryTracker {
    private phase: DeliveryPhase = 'open';

    claim(): Presence {
        if (this.phase !== 'open') {
            return 'absent';
        }
        this.phase = 'claimed';
        return 'present';
    }

    startTyping(): Presence {
        if (this.phase !== 'claimed') {
            return 'absent';
        }
        this.phase = 'typed';
        return 'present';
    }

    settle(): Presence {
        return this.phase === 'claimed' || this.phase === 'typed' ? 'present' : 'absent';
    }

    abandon(): Abandoned {
        switch (this.phase) {
            case 'typed':
                return 'typed';
            case 'claimed':
                this.phase = 'closed';
                return 'claimed';
            case 'open':
            case 'closed':
                this.phase = 'closed';
                return 'none';
            default: {
                const exhaustive: never = this.phase;
                return exhaustive;
            }
        }
    }
}
