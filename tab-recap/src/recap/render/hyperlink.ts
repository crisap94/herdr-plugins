const ESC = String.fromCodePoint(0x1b);
const ST = `${ESC}\\`;
const UNSAFE = /[\p{Cc}\s]/u;

export const CLOSE_LINK = `${ESC}]8;;${ST}`;

export const LINK_SEQUENCE = `${ESC}\\]8;[^;${ESC}\\u0007]*;[^${ESC}\\u0007]*(?:${ESC}\\\\|\\u0007)`;
const PARSED = new RegExp(`^${ESC}\\]8;[^;${ESC}\\u0007]*;([^${ESC}\\u0007]*)(?:${ESC}\\\\|\\u0007)$`, 'u');

export const isSafeUrl = (url: string): boolean => url !== '' && !UNSAFE.test(url);

export const openLink = (url: string): string => `${ESC}]8;;${url}${ST}`;

export const hyperlink = (text: string, url: string): string => (isSafeUrl(url) ? `${openLink(url)}${text}${CLOSE_LINK}` : text);

export function linkAfter(sequence: string): string | null | undefined {
    const url = PARSED.exec(sequence)?.[1];
    if (url === undefined) {
        return undefined;
    }
    return url === '' ? null : sequence;
}
