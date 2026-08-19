import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'

/** 页面可安全读取的凭据状态，不包含凭据值。 */
export interface CredentialStatus {
    /** 当前状态对应的凭据引用。 */
    ref: string
    /** Host 是否能解析到非空凭据。 */
    configured: boolean
    /** 页面是否可以覆盖该凭据。 */
    writable: boolean
    /** 首次查询是否尚未完成。 */
    loading: boolean
}

type CredentialApi = Pick<IApiClient, 'credentials'>

/** 将凭据 API 的只读状态转成 React 可订阅快照。 */
export class CredentialStatusStore {
    private snapshot: CredentialStatus = {
        ref: '',
        configured: false,
        writable: true,
        loading: true,
    }

    private readonly listeners = new Set<() => void>()
    private generation = 0
    private disposed = false

    /** @param api - DSH Web 的凭据 API。 */
    constructor(private readonly api: CredentialApi) {}

    /** @returns 当前不含密钥字面量的快照。 */
    getSnapshot(): CredentialStatus {
        return this.snapshot
    }

    /**
     * 订阅凭据状态变化。
     *
     * @param listener - 快照变化后的回调。
     * @returns 取消订阅的函数。
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    /**
     * 从 Host 重新读取一个凭据引用的状态。
     *
     * @param ref - 要查询的凭据引用。
     * @returns 该次查询结束后完成的 Promise。
     */
    async load(ref: string): Promise<void> {
        if (this.disposed) return
        const expectedGeneration = ++this.generation
        if (ref !== this.snapshot.ref) {
            this.publish({ ref, configured: false, writable: true, loading: true })
        }
        let response: Awaited<ReturnType<IApiClient['credentials']['describe']>>
        try {
            response = await this.api.credentials.describe({ refs: [ref] })
        } catch (_credentialReadFailure) {
            return
        }
        if (this.disposed || expectedGeneration !== this.generation || !response.result.ok) return
        const view = response.result.value.credentials[ref]
        this.publish({
            ref,
            configured: view?.configured ?? false,
            writable: view?.writable ?? true,
            loading: false,
        })
    }

    /**
     * 仅当 Host 报告的引用正是当前引用时刷新。
     *
     * @param ref - `credentials/updated` 事件中的凭据引用。
     */
    refresh(ref: string): void {
        if (ref !== this.snapshot.ref) return
        void this.load(ref)
    }

    /** 停止发布快照，并使已发起的查询失效。 */
    dispose(): void {
        this.disposed = true
        this.generation += 1
        this.listeners.clear()
    }

    private publish(next: CredentialStatus): void {
        this.snapshot = next
        for (const listener of this.listeners) listener()
    }
}
