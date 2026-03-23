/**
 * ObjectPool.ts
 * 对象池系统 - 高性能对象复用管理
 * 
 * 特性：
 * - 支持Node和Component对象池
 * - 自动扩容和缩容
 * - 对象预热
 * - 池满策略配置
 * - 性能统计
 */

import { Component, instantiate, Node, Prefab, warn } from 'cc';
import { Singleton } from './Singleton';

/** 池配置选项 */
export interface PoolOptions {
    initialSize?: number;       // 初始容量 (默认: 5)
    maxSize?: number;           // 最大容量 (默认: 100)
    autoExpand?: boolean;       // 自动扩容 (默认: true)
    expandStep?: number;        // 扩容步长 (默认: 5)
    warmupOnInit?: boolean;     // 初始化时预热 (默认: false)
    allowDestroy?: boolean;     // 允许销毁池中对象 (默认: false)
}

/** 池对象接口 */
export interface IPoolable {
    /** 获取时调用 */
    onPoolGet?(): void;
    /** 回收时调用 */
    onPoolPut?(): void;
    /** 重置状态 */
    reset?(): void;
    /** 是否正在使用中 */
    isInUse?: boolean;
    /** 所属池的标识 */
    poolId?: string;
}

/** 池统计信息 */
interface PoolStats {
    getCount: number;           // 获取次数
    putCount: number;           // 回收次数
    missCount: number;          // 池空次数
    createCount: number;        // 创建次数
    destroyCount: number;       // 销毁次数
    peakSize: number;           // 峰值大小
}

/**
 * 对象池管理器
 * 单例模式管理所有对象池
 */
export class ObjectPoolManager extends Singleton<ObjectPoolManager> {
    private _pools: Map<string, ObjectPool<any>> = new Map();
    private _globalStats = {
        totalGet: 0,
        totalPut: 0,
        totalCreate: 0,
        totalDestroy: 0
    };

    /**
     * 获取或创建对象池
     */
    public getOrCreatePool<T extends Node>(
        key: string,
        prefab: Prefab,
        options?: PoolOptions
    ): ObjectPool<T> {
        if (!this._pools.has(key)) {
            const pool = new ObjectPool<T>(key, prefab, options);
            this._pools.set(key, pool);
            console.log(`[ObjectPool] 创建池: ${key}`);
        }
        return this._pools.get(key)!;
    }

    /**
     * 移除对象池
     */
    public removePool(key: string, destroyObjects: boolean = false): boolean {
        const pool = this._pools.get(key);
        if (!pool) return false;

        if (destroyObjects) {
            pool.clear();
        }
        this._pools.delete(key);
        console.log(`[ObjectPool] 移除池: ${key}`);
        return true;
    }

    /**
     * 清空所有对象池
     */
    public clearAll(destroyObjects: boolean = true): void {
        this._pools.forEach((pool, key) => {
            if (destroyObjects) {
                pool.clear();
            }
        });
        this._pools.clear();
        console.log('[ObjectPool] 清空所有池');
    }

    /**
     * 预热所有池
     */
    public warmupAll(): void {
        this._pools.forEach(pool => pool.warmup());
    }

    /**
     * 获取所有池的统计信息
     */
    public getStats(): object {
        const stats: Record<string, any> = {};
        this._pools.forEach((pool, key) => {
            stats[key] = pool.getStats();
        });
        return {
            pools: stats,
            global: this._globalStats
        };
    }

    /**
     * 销毁
     */
    protected onDestroy(): void {
        this.clearAll(true);
    }
}

/**
 * 对象池类
 */
export class ObjectPool<T extends Node> {
    private _key: string;
    private _prefab: Prefab;
    private _pool: T[] = [];
    private _inUse: Set<T> = new Set();
    private _options: Required<PoolOptions>;
    private _stats: PoolStats;

    constructor(key: string, prefab: Prefab, options: PoolOptions = {}) {
        this._key = key;
        this._prefab = prefab;
        
        this._options = {
            initialSize: options.initialSize ?? 5,
            maxSize: options.maxSize ?? 100,
            autoExpand: options.autoExpand ?? true,
            expandStep: options.expandStep ?? 5,
            warmupOnInit: options.warmupOnInit ?? false,
            allowDestroy: options.allowDestroy ?? false
        };

        this._stats = {
            getCount: 0,
            putCount: 0,
            missCount: 0,
            createCount: 0,
            destroyCount: 0,
            peakSize: 0
        };

        if (this._options.warmupOnInit) {
            this.warmup();
        }
    }

    /**
     * 预热池 - 预先创建对象
     */
    public warmup(count?: number): void {
        const targetCount = count ?? this._options.initialSize;
        const currentAvailable = this._pool.length;
        const needCreate = Math.max(0, targetCount - currentAvailable);

        for (let i = 0; i < needCreate; i++) {
            if (this._pool.length + this._inUse.size >= this._options.maxSize) {
                warn(`[ObjectPool] 池 ${this._key} 已达到最大容量`);
                break;
            }
            const obj = this._createObject();
            this._pool.push(obj);
        }

        console.log(`[ObjectPool] ${this._key} 预热完成，当前容量: ${this._pool.length}`);
    }

    /**
     * 从池中获取对象
     */
    public get(): T {
        this._stats.getCount++;

        let obj: T;

        if (this._pool.length > 0) {
            // 从池中取出
            obj = this._pool.pop()!;
        } else {
            // 池为空
            this._stats.missCount++;

            if (this._pool.length + this._inUse.size >= this._options.maxSize) {
                warn(`[ObjectPool] 池 ${this._key} 已满，强制创建临时对象`);
            }

            obj = this._createObject();
        }

        this._inUse.add(obj);
        this._updatePeakSize();

        // 调用池接口
        const poolable = obj.getComponent('Poolable') as unknown as IPoolable;
        if (poolable?.onPoolGet) {
            poolable.onPoolGet();
        }

        // 重置对象状态
        obj.active = true;
        
        return obj;
    }

    /**
     * 获取带初始化数据的对象
     */
    public getWithInit(initFn: (obj: T) => void): T {
        const obj = this.get();
        initFn(obj);
        return obj;
    }

    /**
     * 回收对象到池
     */
    public put(obj: T): boolean {
        if (!obj || !this._inUse.has(obj)) {
            warn(`[ObjectPool] 尝试回收不在使用中的对象: ${this._key}`);
            return false;
        }

        this._stats.putCount++;
        this._inUse.delete(obj);

        // 调用池接口
        const poolable = obj.getComponent('Poolable') as unknown as IPoolable;
        if (poolable?.onPoolPut) {
            poolable.onPoolPut();
        }

        // 重置对象
        obj.active = false;
        obj.removeFromParent();
        
        // 检查是否需要销毁
        if (this._pool.length >= this._options.maxSize) {
            if (this._options.allowDestroy) {
                this._destroyObject(obj);
                return true;
            }
            // 不回收，直接销毁
            this._destroyObject(obj);
            return false;
        }

        // 重置位置、旋转、缩放
        obj.setPosition(0, 0, 0);
        obj.setRotation(0, 0, 0);
        obj.setScale(1, 1, 1);

        this._pool.push(obj);
        return true;
    }

    /**
     * 批量回收
     */
    public putAll(objs: T[]): void {
        objs.forEach(obj => this.put(obj));
    }

    /**
     * 清空池
     */
    public clear(): void {
        // 销毁池中的对象
        this._pool.forEach(obj => {
            if (obj.isValid) {
                obj.destroy();
            }
        });
        this._pool = [];

        // 销毁使用中的对象（危险操作）
        this._inUse.forEach(obj => {
            if (obj.isValid) {
                warn(`[ObjectPool] 强制销毁使用中的对象: ${this._key}`);
                obj.destroy();
            }
        });
        this._inUse.clear();

        this._stats.destroyCount += this._stats.createCount;
        console.log(`[ObjectPool] ${this._key} 已清空`);
    }

    /**
     * 创建对象
     */
    private _createObject(): T {
        this._stats.createCount++;
        const obj = instantiate(this._prefab) as T;
        
        // 标记池标识
        const poolable = obj.getComponent('Poolable') as unknown as IPoolable;
        if (poolable) {
            poolable.poolId = this._key;
        }

        return obj;
    }

    /**
     * 销毁对象
     */
    private _destroyObject(obj: T): void {
        this._stats.destroyCount++;
        if (obj.isValid) {
            obj.destroy();
        }
    }

    /**
     * 更新峰值
     */
    private _updatePeakSize(): void {
        const currentSize = this._pool.length + this._inUse.size;
        if (currentSize > this._stats.peakSize) {
            this._stats.peakSize = currentSize;
        }
    }

    /**
     * 获取统计信息
     */
    public getStats(): object {
        return {
            ...this._stats,
            available: this._pool.length,
            inUse: this._inUse.size,
            total: this._pool.length + this._inUse.size,
            hitRate: this._stats.getCount > 0 
                ? ((this._stats.getCount - this._stats.missCount) / this._stats.getCount * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * 获取池大小
     */
    public get size(): number {
        return this._pool.length + this._inUse.size;
    }

    /**
     * 获取可用对象数
     */
    public get availableCount(): number {
        return this._pool.length;
    }

    /**
     * 获取使用中对象数
     */
    public get inUseCount(): number {
        return this._inUse.size;
    }

    /**
     * 获取池键
     */
    public get key(): string {
        return this._key;
    }
}

/**
 * 组件对象池 - 用于复用附加到同一节点的组件
 */
export class ComponentPool<T extends Component & IPoolable> {
    private _ctor: new () => T;
    private _pool: T[] = [];
    private _maxSize: number;

    constructor(ctor: new () => T, maxSize: number = 50) {
        this._ctor = ctor;
        this._maxSize = maxSize;
    }

    public get(): T {
        if (this._pool.length > 0) {
            const obj = this._pool.pop()!;
            obj.onPoolGet?.();
            return obj;
        }
        return new this._ctor();
    }

    public put(obj: T): void {
        if (this._pool.length < this._maxSize) {
            obj.onPoolPut?.();
            obj.reset?.();
            this._pool.push(obj);
        }
    }
}

/**
 * 便捷函数：获取对象池管理器
 */
export function getPoolManager(): ObjectPoolManager {
    return ObjectPoolManager.getInstance();
}

/**
 * 便捷函数：快速获取对象池中的对象
 */
export function getFromPool<T extends Node>(key: string): T | null {
    const manager = ObjectPoolManager.getInstance();
    const pool = manager['_pools'].get(key) as ObjectPool<T>;
    return pool ? pool.get() : null;
}
