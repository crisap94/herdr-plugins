/** An unbounded async queue: producers push, one consumer iterates. */
export class AsyncQueue<T> implements AsyncIterable<T> {
    private readonly items: T[] = [];
    private readonly waiters: ((result: IteratorResult<T>) => void)[] = [];
    private ended = false;

    push(item: T): void {
        if (this.ended) {
            return;
        }
        const wake = this.waiters.shift();
        if (wake === undefined) {
            this.items.push(item);
            return;
        }
        wake({ value: item, done: false });
    }

    end(): void {
        this.ended = true;
        for (const wake of this.waiters.splice(0)) {
            wake({ value: undefined, done: true });
        }
    }

    private next(): Promise<IteratorResult<T>> {
        if (this.items.length > 0) {
            return Promise.resolve({ value: this.items.shift() as T, done: false });
        }
        if (this.ended) {
            return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => { this.waiters.push(resolve); });
    }

    [Symbol.asyncIterator](): AsyncIterator<T> {
        return { next: (): Promise<IteratorResult<T>> => this.next() };
    }
}
