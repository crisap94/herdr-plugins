import { ClaudeTool } from '@stateforge-labs/harness-hooks';
import { must } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';


const LOOKERS = /^(cat|sed\s+-n|head|tail)\b/;

export type ReadingTool = typeof ClaudeTool.Read | typeof ClaudeTool.Bash;

export const isReadingTool = (value: unknown): value is ReadingTool => value === ClaudeTool.Read || value === ClaudeTool.Bash;

export interface ToolInput {
    readonly path?: Text;
    readonly command?: Text;
}

type PathLike = 'path' | 'other';

export function parseToolInput(raw: unknown): ToolInput {
    if (typeof raw !== 'object' || raw === null) return {};
    const path = 'file_path' in raw ? raw.file_path : undefined;
    const command = 'command' in raw ? raw.command : undefined;
    return {
        ...(typeof path === 'string' && path !== '' ? { path: must(parseText(path)) } : {}),
        ...(typeof command === 'string' ? { command: must(parseText(command)) } : {}),
    };
}

const unquote = (token: Text): Text => must(parseText(token.replace(/^['"]|['"]$/g, '')));

const NOT_PATH = [/^$/, /^-/, /^[\d,;$p]+$/, /^\d+[,;]\S*p$/];
const PATH_SHAPES = [/^\//, /^~/, /^\.\//, /^\.\.\//, /[\w-]\/[\w.-]/, /\.\w{1,6}$/];

const looksLikePath = (token: Text): PathLike => {
    if (NOT_PATH.some((shape) => shape.test(token))) return 'other';
    return PATH_SHAPES.some((shape) => shape.test(token)) ? 'path' : 'other';
};

export function shellReadsOf(command: Text): readonly Text[] {
    const first = command.trim().split(/\s*(?:\||&&|;|\|\|)\s*/)[0] ?? '';
    if (!LOOKERS.test(first)) return [];
    return first.split(/\s+/).slice(1).map((token) => unquote(must(parseText(token)))).filter((token) => looksLikePath(token) === 'path');
}

export function toolReads(name: ReadingTool, input: ToolInput): readonly Text[] {
    if (name === ClaudeTool.Read) return input.path === undefined ? [] : [input.path];
    return input.command === undefined ? [] : shellReadsOf(input.command);
}
