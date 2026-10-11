export function keep(words: readonly ('a' | 'b')[]): readonly ('a' | 'b')[] {
    return words.filter((word) => word === 'a');
}
