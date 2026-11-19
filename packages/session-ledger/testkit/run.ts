export type TestFn = (name: string, body: () => Promise<void>) => void;

export interface Case<W, S> {
    readonly id: string;
    readonly group: string;
    readonly title: string;
    readonly level: 'surface' | 'full';
    run(world: W, subject: S): Promise<void>;
}

export interface Subject<W, S> {
    readonly name: string;
    readonly level: 'surface' | 'full';
    world(): W;
    create(world: W): S;
}

export interface ConformanceOptions<W, S> {
    readonly test: TestFn;
    readonly cases: readonly Case<W, S>[];
    readonly subject: Subject<W, S>;
    readonly pending: readonly string[];
}

export function runConformance<W, S>({ test, cases, subject, pending }: ConformanceOptions<W, S>): void {
    const pendingIds = new Set(pending);
    for (const kase of cases) {
        if (subject.level === 'surface' && kase.level === 'full') {
            continue;
        }
        test(`${kase.id} ${kase.title}`, async () => {
            const world = subject.world();
            const made = subject.create(world);
            if (!pendingIds.has(kase.id)) {
                await kase.run(world, made);
                return;
            }
            let passed = true;
            try {
                await kase.run(world, made);
            } catch {
                passed = false;
            }
            if (passed) {
                throw new Error(`${kase.id} passes: remove it from pending-${kase.group}.json`);
            }
        });
    }
}
