import { FakeApi, until } from './fake-api.ts';
import { docPath } from './fixture.ts';
import { world } from './herdr.ts';
import { mount, type Mounted } from './mount.ts';
import { hasHandler, maybe, text } from './tree.ts';

export const SHOP = 'w1:t1';
export const SHOP_PATH = '/v1/tabs/w1%3At1';

export interface Served {
    readonly api: FakeApi;
    readonly view: Mounted;
}

export class Session {
    private readonly apis: FakeApi[] = [];
    private readonly views: Mounted[] = [];

    async serve(tab: string = SHOP): Promise<FakeApi> {
        const api = await FakeApi.start();
        this.apis.push(api);
        api.tabs.set(tab, world.files.get(docPath(tab)) ?? '');
        api.advertise();
        return api;
    }

    async open(props: Record<string, unknown>): Promise<Mounted> {
        const view = await mount(props);
        this.views.push(view);
        return view;
    }

    async stop(api: FakeApi): Promise<void> {
        this.apis.splice(this.apis.indexOf(api), 1);
        await api.stop();
    }

    async end(): Promise<void> {
        await Promise.all(this.views.map((view) => view.close()));
        await Promise.all(this.apis.map((api) => api.stop()));
        this.views.length = 0;
        this.apis.length = 0;
    }
}

export const sees = (view: Mounted, id: string): boolean => maybe(view.render(), (data) => data.id === id) !== null;

export const live = (view: Mounted, id: string): boolean => {
    const node = maybe(view.render(), (data) => data.id === id);
    return node !== null && hasHandler(node, 'on_click');
};

export const words = (view: Mounted, id: string): string => {
    const node = maybe(view.render(), (data) => data.id === id);
    return node === null ? '' : text(node);
};

export const waitFor = until;
