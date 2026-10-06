// OSC 8 hyperlinks as text: `ESC ] 8 ; ; URL ESC \ text ESC ] 8 ; ; ESC \`. Pure; a link takes no cells.
const ESC = String.fromCodePoint(0x1b);
const ST = `${ESC}\\`;
const UNSAFE = /[\p{Cc}\s]/u;

/** closes whatever link is open */
export const CLOSE_LINK = `${ESC}]8;;${ST}`;

/** One OSC 8 sequence, opening (`url` not empty) or closing, as a text splitter's capture group. */
export const LINK_SEQUENCE = `${ESC}\\]8;[^;${ESC}\\u0007]*;[^${ESC}\\u0007]*(?:${ESC}\\\\|\\u0007)`;
const PARSED = new RegExp(`^${ESC}\\]8;[^;${ESC}\\u0007]*;([^${ESC}\\u0007]*)(?:${ESC}\\\\|\\u0007)$`, 'u');

/** A URL a terminal may be handed: no control characters (they would end the sequence early or smuggle one in) and no spaces. */
export const isSafeUrl = (url: string): boolean => url !== '' && !UNSAFE.test(url);

export const openLink = (url: string): string => `${ESC}]8;;${url}${ST}`;

/** `text` as a hyperlink to `url`; plain text when the URL is not safe. */
export const hyperlink = (text: string, url: string): string => (isSafeUrl(url) ? `${openLink(url)}${text}${CLOSE_LINK}` : text);

/** What an escape sequence does to the link state: the opening sequence of the link it starts, null when it closes one, undefined when it is not a link sequence. */
export function linkAfter(sequence: string): string | null | undefined {
    const url = PARSED.exec(sequence)?.[1];
    if (url === undefined) {
        return undefined;
    }
    return url === '' ? null : sequence;
}
