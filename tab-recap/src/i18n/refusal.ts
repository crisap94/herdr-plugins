import type { RefusalWords } from '#src/host/policy.mjs';

export const SPANISH_REFUSAL: RefusalWords = {
    headline: (found, needed, path) => `tab-recap necesita Bun >= ${needed}, pero este es ${found} (${path}).`,
    fix: 'Para arreglarlo:',
    install: (needed, options) => `Instala Bun >= ${needed} (${options.join(' · ')}).`,
    steps: {
        brew: () => 'brew install oven-sh/bun/bun',
        mise: () => 'mise use -g bun@latest',
        curl: () => 'curl -fsSL https://bun.sh/install | bash',
        'herdr-stop': () => 'Ejecuta: herdr server stop',
        'new-terminal': (needed) => `Abre una terminal nueva, comprueba que \`bun --version\` muestra ${needed} o superior y lanza herdr desde ella.`,
        'launchctl-path': () => 'Si herdr se lanza desde un lanzador, ejecuta: launchctl setenv PATH "/opt/homebrew/bin:$PATH" y reinícialo.',
    },
};
