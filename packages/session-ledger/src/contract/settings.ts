import type { Brand, Duration } from './kernel.ts';
import type { Section } from './facts.ts';

export type PositiveCount = Brand<number, 'PositiveCount'>;
export type KeepNewest = Brand<number, 'KeepNewest'>;
export type NextHours = Brand<number, 'NextHours'>;

export type HiddenCounts = ReadonlyMap<Section, PositiveCount>;

export interface PrunedWriterView {
    readonly kind: 'pruned';
    readonly keepNewest: KeepNewest;
    readonly nextHours: NextHours;
}

export type WriterView = { readonly kind: 'full' } | PrunedWriterView;

export type Pipeline = 'one' | 'enumerate' | 'enumerate+gates' | 'full';

export type CloseEvidence = 'off' | 'on';

export type StoryRepair = 'off' | 'once';

export type Debounce = { readonly kind: 'off' } | { readonly kind: 'window'; readonly window: Duration };

export type Shown = 'shown' | 'hidden';

export type Pacing = { readonly kind: 'turn' } | { readonly kind: 'smart'; readonly quiet: Duration; readonly maxWait: Duration };
