/**
 * EventBus.ts
 * 全局事件系统 - 提供类型安全的事件订阅/发布机制
 * 
 * 特性：
 * - 类型安全的事件定义
 * - 优先级支持
 * - 一次性事件监听
 * - 事件命名空间
 * - 性能统计
 */

import { Singleton } from './Singleton';

/** 事件处理器类型 */
export type EventHandler<T = any> = (data: T) => void;

/** 事件监听选项 */
export interface EventListenerOptions {
    priority?: number;      // 优先级，数字越大越先执行 (默认: 0)
    once?: boolean;         // 是否只执行一次 (默认: false)
    namespace?: string;     // 命名空间，用于批量管理
}

/** 事件监听器结构 */
interface EventListener<T = any> {
    handler: EventHandler<T>;
    priority: number;
    once: boolean;
    namespace?: string;
    id: number;
}

/** 事件统计信息 */
interface EventStats {
    emitCount: number;
    totalHandleTime: number;
    lastEmitTime: number;
}

/**
 * 全局事件总线
 * 使用示例：
 * 
 * // 定义事件类型
 * interface GameEvents {
 *   'player:move': { x: number; y: number };
 *   'level:complete': { levelId: number; stars: number };
 *   'game:pause': void;
 * }
 * 
 * // 订阅事件
 * EventBus.getInstance().on<GameEvents['player:move']>('player:move', (data) => {
 *   console.log(data.x, data.y);
 * });
 * 
 * // 发布事件
 * EventBus.getInstance().emit('player:move', { x: 10, y: 20 });
 */
export class EventBus extends Singleton<EventBus> {
    private _listeners: Map<string, EventListener[]> = new Map();
    private _stats: Map<string, EventStats> = new Map();
    private _listenerIdCounter: number = 0;
    private _isEmitting: boolean = false;
    private _pendingRemovals: Set<string> = new Set();

    /** 是否启用性能统计 */
    public enableStats: boolean = false;

    /**
     * 订阅事件
     * @param eventName 事件名称
     * @param handler 事件处理器
     * @param options 监听选项
     * @returns 取消订阅的函数
     */
    public on<T = any>(
        eventName: string,
        handler: EventHandler<T>,
        options: EventListenerOptions = {}
    ): () => void {
        const { priority = 0, once = false, namespace } = options;
        const id = ++this._listenerIdCounter;

        const listener: EventListener<T> = {
            handler,
            priority,
            once,
            namespace,
            id
        };

        if (!this._listeners.has(eventName)) {
            this._listeners.set(eventName, []);
        }

        const listeners = this._listeners.get(eventName)!;
        listeners.push(listener);

        // 按优先级排序（高优先级在前）
        listeners.sort((a, b) => b.priority - a.priority);

        console.log(`[EventBus] 订阅事件: ${eventName}, 优先级: ${priority}, ID: ${id}`);

        // 返回取消订阅函数
        return () => {
            this.offById(eventName, id);
        };
    }

    /**
     * 订阅事件（一次性）
     */
    public once<T = any>(
        eventName: string,
        handler: EventHandler<T>,
        options: Omit<EventListenerOptions, 'once'> = {}
    ): () => void {
        return this.on<T>(eventName, handler, { ...options, once: true });
    }

    /**
     * 取消订阅事件
     */
    public off<T = any>(eventName: string, handler: EventHandler<T>): void {
        const listeners = this._listeners.get(eventName);
        if (!listeners) return;

        const index = listeners.findIndex(l => l.handler === handler);
        if (index !== -1) {
            // 如果正在发射事件，延迟移除
            if (this._isEmitting) {
                this._pendingRemovals.add(`${eventName}_${listeners[index].id}`);
            } else {
                listeners.splice(index, 1);
            }
            console.log(`[EventBus] 取消订阅: ${eventName}`);
        }
    }

    /**
     * 通过ID取消订阅
     */
    private offById(eventName: string, listenerId: number): void {
        const listeners = this._listeners.get(eventName);
        if (!listeners) return;

        const index = listeners.findIndex(l => l.id === listenerId);
        if (index !== -1) {
            if (this._isEmitting) {
                this._pendingRemovals.add(`${eventName}_${listenerId}`);
            } else {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * 取消命名空间下的所有事件
     */
    public offNamespace(namespace: string): void {
        this._listeners.forEach((listeners, eventName) => {
            for (let i = listeners.length - 1; i >= 0; i--) {
                if (listeners[i].namespace === namespace) {
                    if (this._isEmitting) {
                        this._pendingRemovals.add(`${eventName}_${listeners[i].id}`);
                    } else {
                        listeners.splice(i, 1);
                    }
                }
            }
        });
        console.log(`[EventBus] 取消命名空间: ${namespace}`);
    }

    /**
     * 发布事件
     */
    public emit<T = any>(eventName: string, data?: T): boolean {
        const listeners = this._listeners.get(eventName);
        if (!listeners || listeners.length === 0) {
            return false;
        }

        this._isEmitting = true;
        const startTime = this.enableStats ? performance.now() : 0;

        // 创建副本，避免在迭代过程中修改
        const listenersCopy = [...listeners];
        const toRemove: number[] = [];

        try {
            for (const listener of listenersCopy) {
                // 检查是否已标记移除
                if (this._pendingRemovals.has(`${eventName}_${listener.id}`)) {
                    continue;
                }

                try {
                    listener.handler(data);
                } catch (error) {
                    console.error(`[EventBus] 事件处理错误: ${eventName}`, error);
                }

                if (listener.once) {
                    toRemove.push(listener.id);
                }
            }
        } finally {
            this._isEmitting = false;

            // 处理延迟移除
            if (this._pendingRemovals.size > 0) {
                this._processPendingRemovals();
            }

            // 移除一次性监听器
            if (toRemove.length > 0) {
                const currentListeners = this._listeners.get(eventName);
                if (currentListeners) {
                    this._listeners.set(
                        eventName,
                        currentListeners.filter(l => !toRemove.includes(l.id))
                    );
                }
            }
        }

        // 更新统计
        if (this.enableStats) {
            this._updateStats(eventName, performance.now() - startTime);
        }

        return true;
    }

    /**
     * 异步发布事件（处理器并行执行）
     */
    public async emitAsync<T = any>(eventName: string, data?: T): Promise<void> {
        const listeners = this._listeners.get(eventName);
        if (!listeners || listeners.length === 0) {
            return;
        }

        const listenersCopy = [...listeners];
        const promises = listenersCopy.map(async listener => {
            try {
                await listener.handler(data);
            } catch (error) {
                console.error(`[EventBus] 异步事件处理错误: ${eventName}`, error);
            }
        });

        await Promise.all(promises);
    }

    /**
     * 处理延迟移除
     */
    private _processPendingRemovals(): void {
        this._pendingRemovals.forEach(key => {
            const [eventName, idStr] = key.split('_');
            const listeners = this._listeners.get(eventName);
            if (listeners) {
                const id = parseInt(idStr);
                const index = listeners.findIndex(l => l.id === id);
                if (index !== -1) {
                    listeners.splice(index, 1);
                }
            }
        });
        this._pendingRemovals.clear();
    }

    /**
     * 更新统计信息
     */
    private _updateStats(eventName: string, handleTime: number): void {
        let stats = this._stats.get(eventName);
        if (!stats) {
            stats = { emitCount: 0, totalHandleTime: 0, lastEmitTime: 0 };
            this._stats.set(eventName, stats);
        }
        stats.emitCount++;
        stats.totalHandleTime += handleTime;
        stats.lastEmitTime = Date.now();
    }

    /**
     * 获取事件统计
     */
    public getStats(eventName?: string): any {
        if (eventName) {
            return this._stats.get(eventName);
        }
        return Object.fromEntries(this._stats);
    }

    /**
     * 获取所有事件名称
     */
    public getEventNames(): string[] {
        return Array.from(this._listeners.keys());
    }

    /**
     * 获取事件监听器数量
     */
    public getListenerCount(eventName?: string): number {
        if (eventName) {
            return this._listeners.get(eventName)?.length || 0;
        }
        let total = 0;
        this._listeners.forEach(listeners => total += listeners.length);
        return total;
    }

    /**
     * 清空所有事件监听
     */
    public clear(): void {
        this._listeners.clear();
        this._stats.clear();
        this._pendingRemovals.clear();
        console.log('[EventBus] 所有事件监听已清空');
    }

    /**
     * 销毁（单例清理）
     */
    protected onDestroy(): void {
        this.clear();
    }
}

/**
 * 便捷函数：获取EventBus实例
 */
export function getEventBus(): EventBus {
    return EventBus.getInstance();
}

/**
 * 预定义的游戏事件类型
 */
export interface GameEvents {
    // 游戏生命周期
    'game:init': void;
    'game:start': void;
    'game:pause': void;
    'game:resume': void;
    'game:stop': void;

    // 关卡事件
    'level:load': { levelId: number };
    'level:start': { levelId: number };
    'level:complete': { levelId: number; stars: number; moves: number };
    'level:fail': { levelId: number; reason: string };
    'level:restart': { levelId: number };

    // 玩家事件
    'player:move': { x: number; y: number; direction: string };
    'player:interact': { targetId: string; targetType: string };
    'player:die': { reason: string };

    // UI事件
    'ui:open': { panelName: string };
    'ui:close': { panelName: string };
    'ui:button:click': { buttonId: string };

    // 资源事件
    'loading:start': { total: number };
    'loading:progress': { current: number; total: number; percent: number };
    'loading:complete': void;
    'loading:error': { path: string; error: Error };

    // 平台事件
    'wx:show': void;
    'wx:hide': void;
    'wx:share': { shareType: string };

    // 性能事件
    'perf:warning': { type: string; value: number };
    'perf:downgrade': void;
    'perf:cleanup': void;
}

/**
 * 类型化事件发射器
 * 使用示例：
 * const emitter = new TypedEventBus<GameEvents>();
 * emitter.emit('level:complete', { levelId: 1, stars: 3, moves: 10 });
 */
export class TypedEventBus<Events extends Record<string, any>> {
    private _bus = EventBus.getInstance();

    public on<K extends keyof Events>(
        eventName: K,
        handler: EventHandler<Events[K]>,
        options?: EventListenerOptions
    ): () => void {
        return this._bus.on(eventName as string, handler, options);
    }

    public once<K extends keyof Events>(
        eventName: K,
        handler: EventHandler<Events[K]>,
        options?: Omit<EventListenerOptions, 'once'>
    ): () => void {
        return this._bus.once(eventName as string, handler, options);
    }

    public emit<K extends keyof Events>(eventName: K, data?: Events[K]): boolean {
        return this._bus.emit(eventName as string, data);
    }
}
