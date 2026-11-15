import type { FakeCx } from './cx.ts';
import { stateOf } from './cx.ts';
import type { FakeState } from './kit.ts';
import { dataOf, isEl, type Data, type El } from './kit.ts';

export type Pick = (data: Data, node: El) => boolean;

export const BOUNDS = { x: 10, y: 20, width: 100, height: 30 };

export function walk(root: El): El[] {
    return [root, ...dataOf(root).children.flatMap((child) => (isEl(child) ? walk(child) : []))];
}

export const all = (root: El, pick: Pick): El[] => walk(root).filter((node) => pick(dataOf(node), node));

export function find(root: El, pick: Pick): El {
    const found = all(root, pick)[0];
    if (!found) {
        throw new Error('no element matched');
    }
    return found;
}

export const maybe = (root: El, pick: Pick): El | null => all(root, pick)[0] ?? null;
export const byId = (root: El, id: string): El => find(root, (data) => data.id === id);
export const hasId = (root: El, id: string): boolean => maybe(root, (data) => data.id === id) !== null;
export const idsOf = (root: El, prefix: string): string[] => walk(root).flatMap((node) => {
    const id = dataOf(node).id;
    return id?.startsWith(prefix) ? [id] : [];
});

export function text(node: El): string {
    const parts = dataOf(node).children.map((child) => (isEl(child) ? text(child) : `${child}`));
    return parts.filter(Boolean).join(' ');
}

export const callsOf = (node: El, name: string): readonly (readonly unknown[])[] => dataOf(node).calls.filter((call) => call.name === name).map((call) => call.args);
export const lastCall = (node: El, name: string): readonly unknown[] | null => callsOf(node, name).at(-1) ?? null;
export const iconsOf = (root: El): string[] => walk(root).flatMap((node) => {
    const path = dataOf(node).extra.get('path');
    return typeof path === 'string' ? [path] : [];
});
export const hasCall = (node: El, name: string): boolean => callsOf(node, name).length > 0;

function fire(node: El, name: string, args: unknown[]): void {
    const handler = dataOf(node).handlers.get(name);
    if (!handler) {
        throw new Error(`no ${name} handler`);
    }
    handler(...args);
}

export const click = (node: El, cx: FakeCx): void => { fire(node, 'on_click', [{ bounds: BOUNDS }, cx]); };
export const mouseDown = (node: El, cx: FakeCx): void => { fire(node, 'on_mouse_down', [{ bounds: BOUNDS }, cx]); };
export const hasHandler = (node: El, name: string): boolean => dataOf(node).handlers.has(name);

export function press(root: El, key: string, cx: FakeCx, modifiers: Record<string, boolean> = {}): void {
    const target = find(root, (data) => data.handlers.has('on_key_down'));
    fire(target, 'on_key_down', [{ key, modifiers }, cx]);
}

export const inputState = (root: El, id: string): FakeState => {
    const field = find(byId(root, id), (data) => data.kind === 'Input' || data.kind === 'Textarea');
    return stateOf(dataOf(field).extra.get('state'));
};
