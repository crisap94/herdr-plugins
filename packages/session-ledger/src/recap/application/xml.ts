import { stripVTControlCharacters } from 'node:util';
import type { Count } from '#src/contract/kernel.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import type { TriggerKind } from './triggers.ts';
import type { ClosedWhy, Fact, Section } from '#src/recap/domain/fact.ts';
import type { CallKind } from '#src/ports/transcripts.ts';
import type { PositiveCount } from '#src/recap/domain/writer-view.ts';
import type { Text } from '#src/recap/domain/text.ts';

type CodePoint = Brand<number, 'CodePoint'>;
type XmlChar = Brand<boolean, 'XmlChar'>;

const textOf = brand<string, 'Text'>;

const isChar = (point: CodePoint): XmlChar =>
    brand<boolean, 'XmlChar'>(point === 0x9 || point === 0xa || point === 0xd || (point >= 0x20 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) || (point >= 0x10000 && point <= 0x10ffff));

export function clean(value: Text): Text {
    return textOf(Array.from(stripVTControlCharacters(value).replace(/\r\n?/g, '\n')).filter((char) => isChar(brand<number, 'CodePoint'>(char.codePointAt(0) ?? 0))).join(''));
}

export function text(value: Text): Text {
    const body = clean(value);
    return textOf(/[<&]|\]\]>/.test(body) ? `<![CDATA[${body.replaceAll(']]>', ']]]]><![CDATA[>')}]]>` : body);
}

export function attribute(value: Text): Text {
    const body = clean(value).replace(/\s+/g, ' ').trim();
    return textOf(`"${body.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')}"`);
}

export type ElementName =
    | 'agent'
    | 'agent_note'
    | 'answer'
    | 'answers'
    | 'call'
    | 'candidate'
    | 'candidates'
    | 'chunk'
    | 'compaction_input'
    | 'correction'
    | 'correction_input'
    | 'cover_input'
    | 'curator_input'
    | 'current_recap'
    | 'current_tasks'
    | 'enumerate_input'
    | 'fact'
    | 'file'
    | 'grading_input'
    | 'hidden'
    | 'item'
    | 'judge_input'
    | 'keyfact'
    | 'keyfacts'
    | 'ledger'
    | 'note'
    | 'operation'
    | 'problem'
    | 'question'
    | 'questions'
    | 'readback_input'
    | 'reason'
    | 'recap'
    | 'recap_input'
    | 'recent'
    | 'refused'
    | 'rubric'
    | 'section'
    | 'sections'
    | 'session_history'
    | 'state'
    | 'tab'
    | 'tail'
    | 'task'
    | 'tools'
    | 'transcript'
    | 'trigger'
    | 'triggers'
    | 'turn'
    | 'writer_input';

export type AttributeName =
    | 'agent'
    | 'agents'
    | 'anchor'
    | 'at'
    | 'branch'
    | 'cli'
    | 'clipped'
    | 'closed'
    | 'closedat'
    | 'count'
    | 'first'
    | 'flagged'
    | 'gate'
    | 'id'
    | 'index'
    | 'key'
    | 'kind'
    | 'label'
    | 'language'
    | 'last'
    | 'mode'
    | 'more'
    | 'name'
    | 'now'
    | 'of'
    | 'omitted'
    | 'cwd'
    | 'pane'
    | 'source'
    | 'op'
    | 'question'
    | 'queued'
    | 'reads'
    | 'ref'
    | 'repo'
    | 'role'
    | 'section'
    | 'settled'
    | 'since'
    | 'state'
    | 'task'
    | 'version'
    | 'what'
    | 'why'
    | 'zone';

export type AttributeMark = 'yes' | 'middle' | 'user' | 'agent' | 'screen' | 'tail' | 'reconcile' | 'add' | 'update' | 'close';

export type AttributeValue = Text | Count | PositiveCount | Section | ClosedWhy | Fact['state'] | CallKind | TriggerKind | AttributeMark | null | undefined;

export type Attributes = Readonly<Partial<Record<AttributeName, AttributeValue>>>;

const attributesOf = (attrs: Attributes): Text =>
    textOf(Object.entries(attrs).flatMap(([name, value]) => (value === null || value === undefined ? [] : [` ${name}=${attribute(textOf(String(value)))}`])).join(''));

export function element(name: ElementName, attrs: Attributes = {}, children: Text = textOf('')): Text {
    return textOf(children === '' ? `<${name}${attributesOf(attrs)}/>` : `<${name}${attributesOf(attrs)}>${children}</${name}>`);
}

export function leaf(name: ElementName, attrs: Attributes, content: Text): Text {
    return textOf(`<${name}${attributesOf(attrs)}>${text(content)}</${name}>`);
}
