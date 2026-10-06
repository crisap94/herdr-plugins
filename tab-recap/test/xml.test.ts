import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attribute, clean, element, leaf, text } from '#src/recap/application/xml.ts';

test('text: plain stays plain; `<` or `&` makes one CDATA section; `]]>` is split', () => {
    assert.equal(text('plain words, 1 > 0'), 'plain words, 1 > 0');
    assert.equal(text('a < b'), '<![CDATA[a < b]]>');
    assert.equal(text('fish & chips'), '<![CDATA[fish & chips]]>');
    assert.equal(text('x ]]> y'), '<![CDATA[x ]]]]><![CDATA[> y]]>', 'a lone `]]>` is still forbidden in content');
    assert.equal(text('<a>]]></a>'), '<![CDATA[<a>]]]]><![CDATA[></a>]]>');
    assert.equal(text(''), '');
});

test('clean: terminal escapes, other control characters, lone surrogates and U+FFFE/F go; tabs, newlines and astral characters stay; CR becomes LF', () => {
    assert.equal(clean('\u001b[31mred\u001b[0m'), 'red');
    assert.equal(clean('a\u0000b\u0001c\u001fd\u007f'), 'abcd\u007f', 'DEL is a legal XML character');
    assert.equal(clean('tab\there\nnew\r\nline\rcr'), 'tab\there\nnew\nline\ncr');
    assert.equal(clean('x\ud800y\udc00z'), 'xyz');
    assert.equal(clean('a￾b￿c'), 'abc');
    assert.equal(clean('ok 😀 é 日本'), 'ok 😀 é 日本');
});

test('attribute: double-quoted, & < > " escaped, every whitespace run one space', () => {
    assert.equal(attribute('say "hi" & <go>'), '"say &quot;hi&quot; &amp; &lt;go&gt;"');
    assert.equal(attribute('  a\n\tb   c  '), '"a b c"');
    assert.equal(attribute('\u001b[1mbold\u0000'), '"bold"');
});

test('element and leaf: attributes in order, null and undefined left out, no children is a self-closing tag', () => {
    assert.equal(element('task', { id: 't1', name: null, agents: 'a1 a2', n: 0, gone: undefined }), '<task id="t1" agents="a1 a2" n="0"/>');
    assert.equal(element('tab', { id: 'x' }, '<agent/>'), '<tab id="x"><agent/></tab>');
    assert.equal(leaf('turn', { role: 'user' }, 'a < b'), '<turn role="user"><![CDATA[a < b]]></turn>');
    assert.equal(leaf('turn', { role: 'user' }, ''), '<turn role="user"></turn>');
});
