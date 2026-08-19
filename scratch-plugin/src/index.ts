import type { Context } from '@deepseek-ai/cordis'

/** Cordis 诊断信息中使用的飞书插件名称。 */
export const name = 'lark-plugin'

/**
 * 注册插件生命周期探针。
 *
 * @param ctx - 管理插件生命周期的 Cordis Context。
 */
export function apply(ctx: Context): void {
  console.log('[lark-plugin] loaded')

  ctx.effect(() => {
    return () => {
      console.log('[lark-plugin] unloaded')
    }
  })
}
