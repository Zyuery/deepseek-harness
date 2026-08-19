import type { Context } from '@deepseek-ai/cordis'

/** Cordis 诊断信息中使用的飞书插件名称。 */
export const name = 'dsh-feishu-bot'

/**
 * 注册插件生命周期探针。
 *
 * @param ctx - 管理插件生命周期的 Cordis Context。
 */
export function apply(ctx: Context): void {
  console.log('[dsh-feishu-bot] loaded')

  ctx.effect(() => {
    return () => {
      console.log('[dsh-feishu-bot] unloaded')
    }
  })
}
