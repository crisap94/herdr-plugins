export type DeliveryPhase = 'open' | 'claimed' | 'typed' | 'closed';

export type Abandoned = 'typed' | 'claimed' | 'none';

export class DeliveryMark {
    private phase: DeliveryPhase = 'open';

    claim(): boolean {
        if (this.phase !== 'open') {
            return false;
        }
        this.phase = 'claimed';
        return true;
    }

    startTyping(): boolean {
        if (this.phase !== 'claimed') {
            return false;
        }
        this.phase = 'typed';
        return true;
    }

    settle(): boolean {
        return this.phase === 'claimed' || this.phase === 'typed';
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
