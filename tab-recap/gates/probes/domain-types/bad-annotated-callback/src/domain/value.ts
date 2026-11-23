export type Visit = (node: string) => void;

export function walk(visit: Visit): void {
    visit('root');
}
