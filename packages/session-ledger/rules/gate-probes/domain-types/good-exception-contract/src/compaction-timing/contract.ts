export interface Skip { readonly tab: string }

export interface DecisionLog {
    skips(): readonly Skip[];
}
