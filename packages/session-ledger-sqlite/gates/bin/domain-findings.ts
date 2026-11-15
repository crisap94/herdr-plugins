export const CATEGORIES = ['parameter', 'return', 'container', 'property', 'assertion', 'legacy'] as const;

export type Category = typeof CATEGORIES[number];

export type Counts = Readonly<Record<string, Readonly<Partial<Record<Category, number>>>>>;

export interface Finding {
    readonly file: string;
    readonly line: number;
    readonly category: Category;
    readonly owner: string;
    readonly parameter: string | null;
    readonly site: string;
    readonly reason: string;
}

const compareText = (left: string, right: string): number => {
    if (left === right) {
        return 0;
    }
    return left < right ? -1 : 1;
};

export const compareFindings = (left: Finding, right: Finding): number =>
    compareText(left.file, right.file) ||
    left.line - right.line ||
    compareText(left.category, right.category) ||
    compareText(left.site, right.site);

export const categoryIn = (file: string, category: Category): Category =>
    /(^|\/)legacy\.ts$/.test(file) ? 'legacy' : category;

export const describeFinding = (finding: Finding): string =>
    `not supported: ${finding.file}:${finding.line}: ${finding.owner}, ${finding.site} ${finding.reason}; use a value object or domain type`;
