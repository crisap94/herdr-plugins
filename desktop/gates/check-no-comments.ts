import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export interface Comment {
    readonly file: string;
    readonly line: number;
    readonly text: string;
}

const SOURCE_FILE = /\.(ts|mts|cts|js|mjs|cjs)$/u;

const tokensOf = (node: ts.Node, source: ts.SourceFile): readonly ts.Node[] => {
    const children = ts.isJSDoc(node) ? [] : node.getChildren(source);
    return children.length === 0 ? [node] : children.flatMap((child) => tokensOf(child, source));
};

const rangesAt = (text: string, start: number): readonly ts.CommentRange[] => (ts.getTrailingCommentRanges(text, start) ?? []).concat(ts.getLeadingCommentRanges(text, start) ?? []);

export const commentsIn = (file: string, text: string): readonly Comment[] => {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const starts = new Set(tokensOf(source, source).map((token) => token.getFullStart()));
    const ranges = new Map([...starts].flatMap((start) => rangesAt(text, start)).map((range) => [range.pos, range]));
    return [...ranges.values()]
        .toSorted((left, right) => left.pos - right.pos)
        .map((range) => ({ file, line: source.getLineAndCharacterOfPosition(range.pos).line + 1, text: text.slice(range.pos, range.end) }));
};

const filesUnder = (root: string, folder: string): readonly string[] => {
    if (!existsSync(join(root, folder))) {
        return [];
    }
    return readdirSync(join(root, folder), { recursive: true, encoding: 'utf8' })
        .filter((name) => SOURCE_FILE.test(name) && !name.split('/').includes('node_modules'))
        .map((name) => join(folder, name))
        .toSorted();
};

export const sourceOf = (root: string): readonly string[] => {
    const parsed: unknown = JSON.parse(readFileSync(join(root, 'gates/config.json'), 'utf8'));
    const source = typeof parsed === 'object' && parsed !== null && 'source' in parsed ? parsed.source : [];
    return Array.isArray(source) ? source.filter((item: unknown): item is string => typeof item === 'string') : [];
};

export const checkNoComments = (root: string, folders: readonly string[]): readonly Comment[] =>
    folders.flatMap((folder) => filesUnder(root, folder)).flatMap((file) => commentsIn(file, readFileSync(join(root, file), 'utf8')));

if (import.meta.main) {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const comments = checkNoComments(root, sourceOf(root));
    comments.forEach((comment) => console.error(`  ${comment.file}:${comment.line}: ${comment.text.split('\n')[0] ?? ''}`));
    console.log(comments.length === 0 ? 'no comments: clean' : `no comments: ${comments.length} comment(s): meaning belongs in names, rationale in the README`);
    process.exitCode = comments.length === 0 ? 0 : 1;
}
