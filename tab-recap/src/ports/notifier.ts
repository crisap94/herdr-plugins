import type { Unknown } from './unknowable.ts';

export type Notified = { readonly kind: 'shown' } | Unknown;

/** A short message for the operator, outside any pane (a herdr toast). */
export interface Notifier {
    notify(title: string, body: string): Promise<Notified>;
}
