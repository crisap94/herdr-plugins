export type Mode = 'open' | 'closed';

export function toggle(mode: Mode): Mode {
    return mode === 'open' ? 'closed' : 'open';
}
