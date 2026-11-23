export function first<T extends string>(items: readonly T[]): T | undefined {
    return items[0];
}
