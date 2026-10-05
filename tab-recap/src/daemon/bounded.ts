/** `task`, unless it takes longer than `ms`: then `'timeout'` and the caller moves on (the task is left to finish or fail by itself). */
export async function bounded(task: Promise<void>, ms: number): Promise<'done' | 'timeout'> {
    const waiting: { timer?: ReturnType<typeof setTimeout> } = {};
    const late = new Promise<'timeout'>((resolve) => { waiting.timer = setTimeout(() => { resolve('timeout'); }, ms); });
    try {
        return await Promise.race([task.then((): 'done' => 'done'), late]);
    } finally {
        clearTimeout(waiting.timer);
    }
}
