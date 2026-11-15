import type { IntentMessage, Key, Role, Tap } from './protocol.ts';

export type Intent =
    | { readonly kind: 'scroll'; readonly lines: number }
    | { readonly kind: 'page'; readonly pages: 1 | -1 }
    | { readonly kind: 'jump'; readonly to: 'top' | 'bottom' }
    | { readonly kind: 'refresh' } | { readonly kind: 'compact' } | { readonly kind: 'configure' }
    | { readonly kind: 'hide' } | { readonly kind: 'show-modal' };

const ESC = '\u001B';
const SHOW_MODAL: Intent = { kind: 'show-modal' };

const KEYS: ReadonlyMap<string, Intent> = new Map<string, Intent>([
    ['j', { kind: 'scroll', lines: 1 }],
    [`${ESC}[B`, { kind: 'scroll', lines: 1 }],
    ['k', { kind: 'scroll', lines: -1 }],
    [`${ESC}[A`, { kind: 'scroll', lines: -1 }],
    [' ', { kind: 'page', pages: 1 }],
    [`${ESC}[6~`, { kind: 'page', pages: 1 }],
    ['b', { kind: 'page', pages: -1 }],
    [`${ESC}[5~`, { kind: 'page', pages: -1 }],
    ['g', { kind: 'jump', to: 'top' }],
    ['G', { kind: 'jump', to: 'bottom' }],
    ['r', { kind: 'refresh' }],
    ['c', { kind: 'compact' }],
    ['s', { kind: 'configure' }],
    ['h', { kind: 'hide' }],
    ['\r', SHOW_MODAL],
]);

const NAMED: ReadonlyMap<IntentMessage['intent'], Intent> = new Map<IntentMessage['intent'], Intent>([
    ['refresh', { kind: 'refresh' }],
    ['hide', { kind: 'hide' }],
    ['show-modal', SHOW_MODAL],
    ['compact', { kind: 'compact' }],
    ['configure', { kind: 'configure' }],
]);

const MODAL_EXITS: ReadonlySet<string> = new Set(['q', ESC]);

export function intentOf(role: Role, input: Key | Tap | IntentMessage): Intent | null {
    const keyed = input.t === 'key' ? KEYS.get(input.key) : undefined;
    const named = input.t === 'intent' ? NAMED.get(input.intent) : undefined;
    const intent = input.t === 'tap' ? SHOW_MODAL : keyed ?? named ?? null;
    return role === 'modal' && intent?.kind === 'show-modal' ? null : intent;
}

export function localOf(role: Role, key: string): 'exit' | null {
    return key === '\u0003' || (role === 'modal' && MODAL_EXITS.has(key)) ? 'exit' : null;
}
