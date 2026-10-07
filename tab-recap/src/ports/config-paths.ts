// Where the plugin keeps its configuration and its state when herdr does not say (`HERDR_PLUGIN_CONFIG_DIR`,
// `HERDR_PLUGIN_STATE_DIR` win over this). One adapter per OS family.
export interface ConfigPaths {
    readonly configDir: string;
    readonly stateDir: string;
}
