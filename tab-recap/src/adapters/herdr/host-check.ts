import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { bindingsOf, bunMajor, boundKeys, herdrConfigPath, type Binding } from './host-check/legacy.ts';

export { MIN_BUN, bunAtLeast } from '#src/host/policy.mjs';
export { bindingsOf, bunMajor, boundKeys, herdrConfigPath, type Binding } from './host-check/legacy.ts';

export interface CommandBinding {
    readonly key: Text;
    readonly action: Text;
}

const commandBindingOf = ({ key, action }: Binding): CommandBinding => ({ key: must(parseText(key)), action: must(parseText(action)) });

export const bunMajorOf = (version: Text): Count | null => {
    const major = parseCount(bunMajor(version));
    return major.kind === 'ok' ? major.value : null;
};

export const bindingsIn = (toml: Text): readonly CommandBinding[] => bindingsOf(toml).map(commandBindingOf);

export const herdrConfigPathOf = (env: NodeJS.ProcessEnv = process.env, home?: Text): Text => must(parseText(herdrConfigPath(env, home)));

export const boundKeysIn = (path?: Text): readonly CommandBinding[] => boundKeys(path).map(commandBindingOf);
