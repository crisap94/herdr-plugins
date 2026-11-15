import type { Role } from './api.ts';
import { makeCx, type FakeCx } from './cx.ts';
import { world } from './herdr.ts';
import type { El } from './kit.ts';
import { loadGui, settle } from './register.ts';
import type { ModuleOf } from './api.ts';

export interface Mounted {
    readonly mod: Role;
    readonly cx: FakeCx;
    render(): El;
    close(): Promise<void>;
}

export async function mount(props: Record<string, unknown> | null): Promise<Mounted> {
    world.props = props;
    const loaded = await loadGui<ModuleOf<Role>>('main.js');
    const mod = new loaded.default();
    const cx = makeCx();
    mod.init(null, cx);
    await settle();
    return { mod, cx, render: () => mod.render(cx), close: () => mod.close(cx) };
}
