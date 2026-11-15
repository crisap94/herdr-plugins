import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { guiPath } from './support/register.ts';

const ROOT = guiPath('');
const COLOUR_HOMES = new Set(['theme.js', 'constants.js']);

function listing(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? listing(path) : [path];
    });
}

const sources = listing(ROOT).filter((path) => path.endsWith('.js')).map((path) => ({ name: relative(ROOT, path), code: readFileSync(path, 'utf8') }));

const REGEX_LEAD = '=(,:[!&|?{};';

function skipRegex(code: string, from: number): number {
    let at = from + 1;
    let inClass = false;
    while (at < code.length) {
        const char = code.charAt(at);
        if (char === '\\') {
            at += 1;
        } else if (char === '[') {
            inClass = true;
        } else if (char === ']') {
            inClass = false;
        } else if (char === '/' && !inClass) {
            return at;
        }
        at += 1;
    }
    return at;
}

const QUOTES = new Set(['"', "'", '`']);

const startsRegex = (code: string, at: number, lead: string): boolean => code.charAt(at) === '/' && !'/*'.includes(code.charAt(at + 1)) && REGEX_LEAD.includes(lead);

function inQuote(code: string, at: number, quote: string): { next: number; quote: string } {
    const char = code.charAt(at);
    if (char === '\\') {
        return { next: at + 1, quote };
    }
    return { next: at, quote: char === quote ? '' : quote };
}

function withoutLiterals(code: string): string {
    let out = '';
    let quote = '';
    for (let at = 0; at < code.length; at += 1) {
        const lead = out.trimEnd().slice(-1);
        if (quote) {
            const step = inQuote(code, at, quote);
            quote = step.quote;
            at = step.next;
            out += ' ';
        } else if (QUOTES.has(code.charAt(at))) {
            quote = code.charAt(at);
            out += ' ';
        } else if (startsRegex(code, at, lead)) {
            const end = skipRegex(code, at);
            out += ' '.repeat(end - at + 1);
            at = end;
        } else {
            out += code.charAt(at);
        }
    }
    return out;
}

const offenders = (pattern: RegExp, skip: string[] = []): string[] => sources.filter((one) => !skip.includes(one.name) && pattern.test(withoutLiterals(one.code))).map((one) => one.name);

test('the scan sees the whole mod', () => {
    assert.ok(sources.length >= 40);
    assert.ok(sources.some((one) => one.name === 'main.js'));
    assert.ok(sources.some((one) => one.name === join('roles', 'window.js')));
});

test('no setTimeout or setInterval appears anywhere in the mod', () => {
    assert.deepEqual(sources.filter((one) => /\bset(Timeout|Interval|Immediate)\b/.test(one.code)).map((one) => one.name), []);
});

test('there are no comments', () => {
    assert.deepEqual(offenders(/\/\/|\/\*/), []);
});

test('no node module and no require is used', () => {
    assert.deepEqual(sources.filter((one) => /["']node:|\brequire\(|\bprocess\.|\bBuffer\b/.test(one.code)).map((one) => one.name), []);
});

test('exec is never given a shell or a built command string', () => {
    assert.deepEqual(sources.filter((one) => /\bexec\(\s*["'`](sh|bash|zsh)["'`]/.test(one.code) || /\bexec\(\s*`/.test(one.code)).map((one) => one.name), []);
    assert.deepEqual(sources.filter((one) => /\b(execSync|execFile|eval)\(/.test(one.code)).map((one) => one.name), []);
});

test('hex colours live only in the theme tokens and the constants', () => {
    assert.deepEqual(sources.filter((one) => !COLOUR_HOMES.has(one.name) && /#[0-9a-fA-F]{3,8}\b/.test(one.code)).map((one) => one.name), []);
});

test('localStorage is used in one module only, and always inside a try', () => {
    const users = sources.filter((one) => one.code.includes('localStorage'));
    assert.deepEqual(users.map((one) => one.name), ['seen.js']);
    const code = users[0]?.code ?? '';
    for (const match of code.matchAll(/localStorage/g)) {
        const before = code.slice(0, match.index);
        assert.ok(before.lastIndexOf('try {') > before.lastIndexOf('}\n\n'), `at ${match.index}`);
    }
});

test('private host names and home paths are not baked in', () => {
    assert.deepEqual(sources.filter((one) => /\/home\/\w+|\/Users\/\w+|\.internal\b|\.lan\b/.test(one.code)).map((one) => one.name), []);
});

test('every module imports only relative files and the three host modules', () => {
    const allowed = new Set(['gpui-kit', 'gpui-base', 'herdr']);
    const bad = sources.flatMap((one) => [...one.code.matchAll(/from "([^"]+)"/g)].map((match) => match[1] ?? '').filter((spec) => !spec.startsWith('.') && !allowed.has(spec)));
    assert.deepEqual(bad, []);
});

test('the scanner bites: a comment is seen, the same characters in a string or a regex are not', () => {
    assert.match(withoutLiterals('const a = 1; // note'), /\/\//);
    assert.match(withoutLiterals('/* note */ const a = 1;'), /\/\*/);
    assert.doesNotMatch(withoutLiterals('const a = "// note";'), /\/\//);
    assert.doesNotMatch(withoutLiterals('const a = /^https?:\\/\\//;'), /\/\//);
    assert.doesNotMatch(withoutLiterals('const a = `/* ${1} */`;'), /\/\*/);
});
