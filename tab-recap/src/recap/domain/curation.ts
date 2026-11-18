import { parseText, type Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';

export const STORY_WORDS = 120;

export const STORY_TOO_LONG = 'the paragraph is too long';

export type Story = Text;

export function parseStory(raw: unknown): Story | null {
    if (typeof raw !== 'string') {
        return null;
    }
    const words = raw.split(/\s+/u).filter((word) => word !== '');
    if (words.length === 0 || words.length > STORY_WORDS) {
        return null;
    }
    const story = parseText(words.join(' '));
    return story.kind === 'ok' ? story.value : null;
}

export const storyOf = parseStory;

export type { Curation, Merge } from './legacy.ts';
export { curationOf } from './legacy.ts';
