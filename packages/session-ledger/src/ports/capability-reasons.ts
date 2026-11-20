export type HistoryWhy = 'history-unavailable';
export type InFlightWhy = 'unregistered-reader' | 'screen' | 'windowed-reader' | 'in-flight-unavailable';
export type SplitWhy = 'claude-background-lost' | 'codex-cells' | 'opencode-parts';
export type ContextWindowWhy = 'context-window-unavailable';
export type CompactionWhy = 'compaction-unavailable';

export { capabilityWording, inFlightReason, splitReason } from './legacy.ts';
