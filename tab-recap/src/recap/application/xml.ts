// The one way text and attributes enter the writer's XML document: well-formed whatever the transcripts hold (XML 1.0 §2.2, §2.4, §2.7, §3.3.3).
import { stripVTControlCharacters } from 'node:util';

/** XML 1.0 `Char`: tab, newline, carriage return and everything from space up except the surrogate block and U+FFFE/U+FFFF. */
const isChar = (point: number): boolean =>
    point === 0x9 || point === 0xa || point === 0xd || (point >= 0x20 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) || (point >= 0x10000 && point <= 0x10ffff);

/** Terminal escapes first, then every character XML cannot carry (other controls, lone surrogates); line ends are `\n`. */
export function clean(value: string): string {
    return Array.from(stripVTControlCharacters(value).replace(/\r\n?/g, '\n')).filter((char) => isChar(char.codePointAt(0) ?? 0)).join('');
}

/** Text content: plain unless it holds `<`, `&` or `]]>`, then one CDATA section (a `]]>` inside is split across two). */
export function text(value: string): string {
    const body = clean(value);
    return /[<&]|\]\]>/.test(body) ? `<![CDATA[${body.replaceAll(']]>', ']]]]><![CDATA[>')}]]>` : body;
}

/** An attribute value, double-quoted: `&`, `<`, `>` and `"` escaped, every run of whitespace one space. */
export function attribute(value: string): string {
    const body = clean(value).replace(/\s+/g, ' ').trim();
    return `"${body.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')}"`;
}

export type Attributes = Readonly<Record<string, string | number | null | undefined>>;

const attributesOf = (attrs: Attributes): string =>
    Object.entries(attrs).flatMap(([name, value]) => (value === null || value === undefined ? [] : [` ${name}=${attribute(String(value))}`])).join('');

/** `<name a="1">children</name>`; children are already-serialized markup. No children: `<name a="1"/>`. */
export function element(name: string, attrs: Attributes = {}, children = ''): string {
    return children === '' ? `<${name}${attributesOf(attrs)}/>` : `<${name}${attributesOf(attrs)}>${children}</${name}>`;
}

/** An element whose content is text. */
export function leaf(name: string, attrs: Attributes, content: string): string {
    return `<${name}${attributesOf(attrs)}>${text(content)}</${name}>`;
}
