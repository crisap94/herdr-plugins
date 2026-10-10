export async function bounded(task: Promise<void>, ms: number): Promise<'done' | 'timeout'> {
    const waiting: { timer?: ReturnType<typeof setTimeout> } = {};
    const late = new Promise<'timeout'>((resolve) => { waiting.timer = setTimeout(() => { resolve('timeout'); }, ms); });
    try {
        return await Promise.race([task.then((): 'done' => 'done'), late]);
    } finally {
        clearTimeout(waiting.timer);
    }
}

export async function within<T>(task: Promise<T>, ms: number, fallback: T): Promise<T> {
    const waiting: { timer?: ReturnType<typeof setTimeout> } = {};
    const late = new Promise<T>((resolve) => { waiting.timer = setTimeout(() => { resolve(fallback); }, ms); });
    try {
        return await Promise.race([task, late]);
    } finally {
        clearTimeout(waiting.timer);
    }
}
