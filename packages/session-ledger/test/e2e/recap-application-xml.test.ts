import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attribute, clean, element, leaf, text } from '@stateforge-labs/session-ledger';
import { brand } from '@stateforge-labs/session-ledger';

const t = brand<string, 'Text'>;
const n = brand<number, 'Count'>;

test('text: plain stays plain; `<` or `&` makes one CDATA section; `]]>` is split', () => {
    assert.equal(text(t('plain words, 1 > 0')), 'plain words, 1 > 0');
    assert.equal(text(t('a < b')), '<![CDATA[a < b]]>');
    assert.equal(text(t('fish & chips')), '<![CDATA[fish & chips]]>');
    assert.equal(text(t('x ]]> y')), '<![CDATA[x ]]]]><![CDATA[> y]]>', 'a lone `]]>` is still forbidden in content');
    assert.equal(text(t('<a>]]></a>')), '<![CDATA[<a>]]]]><![CDATA[></a>]]>');
    assert.equal(text(t('')), '');
});

test('clean: terminal escapes, other control characters, lone surrogates and U+FFFE/F go; tabs, newlines and astral characters stay; CR becomes LF', () => {
    assert.equal(clean(t('\u001b[31mred\u001b[0m')), 'red');
    assert.equal(clean(t('a\u0000b\u0001c\u001fd\u007f')), 'abcd\u007f', 'DEL is a legal XML character');
    assert.equal(clean(t('tab\there\nnew\r\nline\rcr')), 'tab\there\nnew\nline\ncr');
    assert.equal(clean(t('x\ud800y\udc00z')), 'xyz');
    assert.equal(clean(t('a￾b￿c')), 'abc');
    assert.equal(clean(t('ok 😀 é 日本')), 'ok 😀 é 日本');
});

test('attribute: double-quoted, & < > " escaped, every whitespace run one space', () => {
    assert.equal(attribute(t('say "hi" & <go>')), '"say &quot;hi&quot; &amp; &lt;go&gt;"');
    assert.equal(attribute(t('  a\n\tb   c  ')), '"a b c"');
    assert.equal(attribute(t('\u001b[1mbold\u0000')), '"bold"');
});

test('element and leaf: attributes in order, null and undefined left out, no children is a self-closing tag', () => {
    assert.equal(element('task', { id: t('t1'), name: null, agents: t('a1 a2'), more: n(0), since: undefined }), '<task id="t1" agents="a1 a2" more="0"/>');
    assert.equal(element('tab', { id: t('x') }, t('<agent/>')), '<tab id="x"><agent/></tab>');
    assert.equal(leaf('turn', { role: 'user' }, t('a < b')), '<turn role="user"><![CDATA[a < b]]></turn>');
    assert.equal(leaf('turn', { role: 'user' }, t('')), '<turn role="user"></turn>');
});
