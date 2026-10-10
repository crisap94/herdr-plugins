export const MIN_NODE = '24.21.0';

const versionParts = (text) => (/^v?(\d+)\.(\d+)\.(\d+)/.exec(text.trim()) ?? []).slice(1).map(Number);

export function nodeAtLeast(version, minimum = MIN_NODE) {
    const [have, need] = [versionParts(version), versionParts(minimum)];
    if (have.length !== 3) {
        return false;
    }
    const at = need.findIndex((part, index) => part !== have[index]);
    return at === -1 || (have[at] ?? 0) > (need[at] ?? 0);
}

const STEPS = {
    macos: ['brew', 'mise', 'nvm', 'herdr-stop', 'new-terminal', 'launchctl-path'],
    linux: ['nvm', 'mise', 'n', 'herdr-stop', 'new-terminal'],
    windows: ['winget', 'nvm-windows', 'restart-herdr'],
};

const INSTALLERS = new Set(['brew', 'mise', 'nvm', 'n', 'winget', 'nvm-windows']);

export function supportOf(host) {
    if (nodeAtLeast(host.nodeVersion)) {
        return { ok: true };
    }
    const platform = host.platform in STEPS ? host.platform : 'linux';
    return { ok: false, found: host.nodeVersion, needed: MIN_NODE, platform, steps: STEPS[platform] };
}

export const ENGLISH = {
    headline: (found, needed, path) => `tab-recap needs Node >= ${needed}, but this is ${found} (${path}).`,
    fix: 'To fix it:',
    install: (needed, options) => `Install Node >= ${needed} (${options.join(' · ')}).`,
    steps: {
        brew: () => 'brew install node',
        mise: () => 'mise use -g node@24',
        nvm: () => 'nvm install 24',
        n: () => 'n 24',
        winget: () => 'winget install OpenJS.NodeJS',
        'nvm-windows': () => 'nvm install 24 (nvm-windows)',
        'herdr-stop': () => 'Run: herdr server stop',
        'new-terminal': (needed) => `Open a new terminal, check that \`node --version\` prints ${needed} or newer, and start herdr from it.`,
        'launchctl-path': () => 'If herdr is started from a launcher, run: launchctl setenv PATH "/opt/homebrew/bin:$PATH" and restart it.',
        'restart-herdr': () => 'Close herdr, open a new terminal where `node --version` is new enough, and start herdr again.',
    },
};

export function renderRefusal(refusal, path, words = ENGLISH) {
    const { found, needed, steps } = refusal;
    const options = steps.filter((id) => INSTALLERS.has(id)).map((id) => words.steps[id](needed));
    const others = steps.filter((id) => !INSTALLERS.has(id)).map((id) => words.steps[id](needed));
    const numbered = [words.install(needed, options), ...others].map((line, index) => `  ${index + 1}. ${line}`);
    return [words.headline(found, needed, path), words.fix, ...numbered].join('\n');
}
