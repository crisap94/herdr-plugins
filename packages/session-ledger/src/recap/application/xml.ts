import { stripVTControlCharacters } from 'node:util';

const isChar = (point: number): boolean =>
    point === 0x9 || point === 0xa || point === 0xd || (point >= 0x20 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) || (point >= 0x10000 && point <= 0x10ffff);

export function clean(value: string): string {
    return Array.from(stripVTControlCharacters(value).replace(/\r\n?/g, '\n')).filter((char) => isChar(char.codePointAt(0) ?? 0)).join('');
}

export function text(value: string): string {
    const body = clean(value);
    return /[<&]|\]\]>/.test(body) ? `<![CDATA[${body.replaceAll(']]>', ']]]]><![CDATA[>')}]]>` : body;
}

export function attribute(value: string): string {
    const body = clean(value).replace(/\s+/g, ' ').trim();
    return `"${body.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')}"`;
}

export type Attributes = Readonly<Record<string, string | number | null | undefined>>;

const attributesOf = (attrs: Attributes): string =>
    Object.entries(attrs).flatMap(([name, value]) => (value === null || value === undefined ? [] : [` ${name}=${attribute(String(value))}`])).join('');

export function element(name: string, attrs: Attributes = {}, children = ''): string {
    return children === '' ? `<${name}${attributesOf(attrs)}/>` : `<${name}${attributesOf(attrs)}>${children}</${name}>`;
}

export function leaf(name: string, attrs: Attributes, content: string): string {
    return `<${name}${attributesOf(attrs)}>${text(content)}</${name}>`;
}
