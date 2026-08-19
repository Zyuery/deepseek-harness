import type { UserConfig } from 'tsdown'

const CLIENT_EXTERNALS = [
    'react',
    'react/jsx-runtime',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-ui-slots',
] as const

/** 将浏览器代码打包成 DSH Client Loader 要求的延迟 CJS factory。 */
const config: UserConfig = {
    name: '@zyuer/dsh-feishu-bot/client',
    entry: { client: 'lib/client/index.js' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
        neverBundle: [...CLIENT_EXTERNALS],
        alwaysBundle: (id: string) => !CLIENT_EXTERNALS.includes(id as never),
    },
    outputOptions: {
        entryFileNames: 'client.js',
        banner: 'window.__ModuleLoader__.load({ id: "@zyuer/dsh-feishu-bot", factory: (require) => {',
        footer: 'return module.exports; } });',
        intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
}

export default config
