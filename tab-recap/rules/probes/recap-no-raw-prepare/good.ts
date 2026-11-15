export function count(orm: { all(query: string): unknown[] }): unknown[] {
    return orm.all('SELECT COUNT(*) FROM run');
}
