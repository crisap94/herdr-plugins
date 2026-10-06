/** What a model can hold, from a local catalogue of models. */
export interface ModelCatalogue {
    /** The model's context window in tokens (`provider/model`, or a bare model id); null when the catalogue does not know it. */
    windowOf(model: string): number | null;
}
