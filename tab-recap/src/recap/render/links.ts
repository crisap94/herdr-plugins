import type { LaneWeb } from '#src/ports/tab-views.ts';

export interface Segment {
    readonly text: string;
    readonly url?: string;
}

type Context = LaneWeb | null | undefined;

const TOKEN = /`(?<code>[^`\n]+)`|(?<url>https?:\/\/[^\s\p{Cc}`<>]+)|(?<![\w!])(?<mr>!\d+)\b|(?<![\w&#])(?<issue>#\d+)\b|(?<![\w./@#-])(?<sha>[0-9a-f]{7,40})(?![\w-])/gu;
const WHOLE_URL = /^https?:\/\/[^\s\p{Cc}]+$/u;
const FILE = /^(?:\.\/)?(?<path>[\w@.-]+(?:\/[\w@.+-]+)*\.[A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*)(?::(?<line>\d+))?$/u;
const BRANCH_LIKE = /^[\w.-]+\/[\w./-]+$/u;
const EXTENSION = /\.[A-Za-z0-9]*[A-Za-z]/u;
const TRAILING = '.,;:!?\'"]}>';

const encoded = (path: string): string => path.split('/').map(encodeURIComponent).join('/');
const escaped = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\/]/gu, String.raw`\$&`);

export function contextOf(contexts: readonly Context[]): LaneWeb | null {
    const [first, ...rest] = contexts.flatMap((context) => context ?? []);
    if (first === undefined || rest.some((other) => other.base !== first.base)) {
        return null;
    }
    return { ...first, branch: rest.every((other) => other.branch === first.branch) ? first.branch : null };
}

function trimmed(url: string): string {
    let end = url.length;
    while (end > 0) {
        const last = url.charAt(end - 1);
        const unmatched = last === ')' && url.slice(0, end).split(')').length > url.slice(0, end).split('(').length;
        if (!TRAILING.includes(last) && !unmatched) {
            break;
        }
        end -= 1;
    }
    return url.slice(0, end);
}

const hasLetterAndDigit = (text: string): boolean => /\d/u.test(text) && /[a-f]/u.test(text);

function numbered(token: string, web: LaneWeb): string | null {
    const dash = web.forge === 'gitlab' ? '/-' : '';
    if (token.startsWith('!')) {
        return web.forge === 'gitlab' ? `${web.base}/-/merge_requests/${token.slice(1)}` : null;
    }
    if (token.startsWith('#')) {
        return `${web.base}${web.forge === 'gitlab' ? '/-/issues/' : '/pull/'}${token.slice(1)}`;
    }
    return /^[0-9a-f]{7,40}$/u.test(token) && hasLetterAndDigit(token) ? `${web.base}${dash}/commit/${token}` : null;
}

function fileUrl(token: string, web: LaneWeb): string | null {
    const file = FILE.exec(token)?.groups;
    const path = file?.['path'];
    if (path === undefined || path.startsWith('..') || web.branch === null) {
        return null;
    }
    const line = file?.['line'];
    return `${web.base}${web.forge === 'gitlab' ? '/-' : ''}/blob/${encoded(web.branch)}/${encoded(path)}${line === undefined ? '' : `#L${line}`}`;
}

const isBranch = (token: string, web: LaneWeb): boolean => token === web.branch || (BRANCH_LIKE.test(token) && !EXTENSION.test(token.slice(token.lastIndexOf('/'))));

function coded(token: string, web: LaneWeb | null): string | null {
    if (WHOLE_URL.test(token)) {
        return token;
    }
    if (web === null) {
        return null;
    }
    const file = token === web.branch ? null : fileUrl(token, web);
    if (file !== null) {
        return file;
    }
    return isBranch(token, web) ? `${web.base}${web.forge === 'gitlab' ? '/-' : ''}/tree/${encoded(token)}` : numbered(token, web);
}

function bare(text: string, web: LaneWeb | null): Segment[] {
    const branch = web?.branch ?? null;
    if (web === null || branch === null || /^[a-z]+$/u.test(branch)) {
        return [{ text: text.replaceAll('`', '') }];
    }
    const pieces = text.split(new RegExp(`(?<![\\w./-])(${escaped(branch)})(?![\\w/-])`, 'u'));
    const url = coded(branch, web) ?? undefined;
    return pieces.flatMap((piece, at): Segment[] => {
        if (piece === '') {
            return [];
        }
        return at % 2 === 1 && url !== undefined ? [{ text: piece, url }] : [{ text: piece.replaceAll('`', '') }];
    });
}

function referenceOf(match: RegExpExecArray | RegExpMatchArray, web: LaneWeb | null): { shown: string; target: string | null; used: number } {
    const { code, url } = match.groups ?? {};
    if (code !== undefined) {
        return { shown: code, target: coded(code, web), used: match[0].length };
    }
    if (url !== undefined) {
        return { shown: trimmed(url), target: trimmed(url), used: trimmed(url).length };
    }
    return { shown: match[0], target: web === null ? null : numbered(match[0], web), used: match[0].length };
}

export function linkify(text: string, contexts: readonly Context[]): Segment[] {
    const web = contextOf(contexts);
    const segments: Segment[] = [];
    let at = 0;
    for (const match of text.matchAll(TOKEN)) {
        const { shown, target, used } = referenceOf(match, web);
        segments.push(...bare(text.slice(at, match.index), web), target === null ? { text: shown } : { text: shown, url: target });
        at = match.index + used;
    }
    return [...segments, ...bare(text.slice(at), web)];
}
