import type { Brand } from '#src/recap/domain/brand.ts';

export type PromptBody = Brand<string, 'PromptBody'>;

const PASTED = /^\n*<pasted_content id="([^"\s<>]+)">\n([\s\S]*)\n<\/pasted_content(?: id="\1")?>\n?$/;

export function promptBodyOf(stored: unknown): PromptBody {
    const text = typeof stored === 'string' ? stored : '';
    const match = PASTED.exec(text);
    return (match === null ? text : (match[2] ?? '')) as PromptBody;
}
