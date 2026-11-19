type Flow = 'open' | 'ended';

type Item<T> = { readonly value: T };

type Step<T> = IteratorResult<T, undefined>;

export class AsyncQueue<T> implements AsyncIterable<T> {
    private readonly items: Item<T>[] = [];
    private readonly waiters: ((step: Step<T>) => void)[] = [];
    private flow: Flow = 'open';

    push(item: T): void {
        if (this.flow === 'ended') {
            return;
        }
        const wake = this.waiters.shift();
        if (wake === undefined) {
            this.items.push({ value: item });
            return;
        }
        wake({ value: item, done: false });
    }

    end(): void {
        this.flow = 'ended';
        for (const wake of this.waiters.splice(0)) {
            wake({ value: undefined, done: true });
        }
    }

    private next(): Promise<Step<T>> {
        const item = this.items.shift();
        if (item !== undefined) {
            return Promise.resolve({ value: item.value, done: false });
        }
        if (this.flow === 'ended') {
            return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise<Step<T>>((resolve) => { this.waiters.push(resolve); });
    }

    [Symbol.asyncIterator](): AsyncIterator<T, undefined, undefined> {
        return { next: (): Promise<Step<T>> => this.next() };
    }
}
