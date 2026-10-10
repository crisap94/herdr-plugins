import type { Unknown } from './unknowable.ts';

export type Notified = { readonly kind: 'shown' } | Unknown;

export interface Notifier {
    notify(title: string, body: string): Promise<Notified>;
}
