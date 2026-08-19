import type { Context } from '@deepseek-ai/cordis'

/** Identifies the minimal Lark lifecycle plugin in Cordis diagnostics. */
export const name = 'lark-plugin'

/**
 * Installs a lifecycle probe whose disposer runs when Cordis unloads the plugin.
 *
 * @param ctx - Cordis context that owns the plugin lifecycle.
 */
export function apply(ctx: Context): void {
  console.log('[lark-plugin] loaded')

  ctx.effect(() => {
    return () => {
      console.log('[lark-plugin] unloaded')
    }
  })
}
