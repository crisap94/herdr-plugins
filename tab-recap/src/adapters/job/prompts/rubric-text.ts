import { readFileSync } from 'node:fs';
import { must } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';

export interface Rubric {
    readonly items: Text;
    readonly sections: Text;
    readonly whole: Text;
}

const RUBRIC_FILE = new URL('../../../../schema/recap-rubric.md', import.meta.url);

export function partText(markdown: Text, title: Text): Text {
    const parts = markdown.split(/^## /m).slice(1);
    const found = parts.find((part) => part.startsWith(title));
    return must(parseText(found === undefined ? '' : found.slice(found.indexOf('\n') + 1).trim()));
}

export const rubricText = (markdown: Text): Rubric => ({
    items: partText(markdown, must(parseText('Every item'))),
    sections: partText(markdown, must(parseText('Per section'))),
    whole: partText(markdown, must(parseText('Whole recap'))),
});

export const RUBRIC_TEXT: Text = must(parseText(readFileSync(RUBRIC_FILE, 'utf8')));

export const RUBRIC: Rubric = rubricText(RUBRIC_TEXT);
