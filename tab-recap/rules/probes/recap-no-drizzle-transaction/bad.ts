export function save(orm: { transaction(work: () => void): void }): void {
    orm.transaction(() => {});
}
