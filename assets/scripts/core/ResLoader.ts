/**
 * ResLoader.ts
 * 资源加载器 - 统一资源管理和加载
 * 
 * 特性：
 * - 引用计数管理
 * - 批量加载
 * - 加载队列
 * - 缓存管理
 * - 自动释放
 * - 加载进度追踪
 */

import { 
    Asset, 
    assetManager, 
    AssetManager, 
    director, 
    error, 
    ImageAsset, 
    instantiate, 
    JsonAsset, 
    log, 
    Prefab, 
    resources, 
    SceneAsset, 
    SpriteFrame, 
    Texture2D, 
    warn 
} from 'cc';
import { Singleton } from './Singleton';
import { EventBus } from './EventBus';

/** 资源类型 */
export type ResType = 
    | typeof Prefab
    | typeof SpriteFrame 
    | typeof Texture2D 
    | typeof JsonAsset 
    | typeof SceneAsset 
    | typeof ImageAsset
    | typeof Asset;

/** 加载选项 */
export interface LoadOptions {
    priority?: number;          // 加载优先级 (默认: 0)
    cache?: boolean;            // 是否缓存 (默认: true)
    autoRelease?: boolean;      // 自动释放 (默认: false)
    bundle?: string;            // 资源包名 (默认: 'resources')
}

/** 加载任务 */
interface LoadTask {
    path: string;
    type: ResType;
    options: Required<LoadOptions>;
    resolve: (asset: Asset) => void;
    reject: (err: Error) => void;
    startTime: number;
}

/** 资源引用信息 */
interface AssetRef {
    asset: Asset;
    count: number;
    lastUsed: number;
    autoRelease: boolean;
}

/** 加载统计 */
interface LoadStats {
    totalRequests: number;
    cacheHits: number;
    cacheMisses: number;
    totalLoadTime: number;
    errors: number;
}

/**
 * 资源加载器
 * 单例模式管理所有资源加载
 */
export class ResLoader extends Singleton<ResLoader> {
    private _cache: Map<string, AssetRef> = new Map();
    private _loadQueue: LoadTask[] = [];
    private _loading: Set<string> = new Set();
    private _stats: LoadStats = {
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        totalLoadTime: 0,
        errors: 0
    };
    private _eventBus = EventBus.getInstance();

    /** 最大并发加载数 */
    public maxConcurrency: number = 5;

    /** 缓存大小限制 (MB) */
    public maxCacheSize: number = 50;

    /** 自动清理间隔 (秒) */
    public autoCleanInterval: number = 300;

    private _cleanTimer: number | null = null;

    /**
     * 初始化
     */
    protected onInitialize(): void {
        // 启动自动清理定时器
        this._startAutoClean();
        
        // 监听场景切换，释放未引用资源
        director.on(director.EVENT_BEFORE_SCENE_LAUNCH, this._onSceneChange, this);
        
        console.log('[ResLoader] 初始化完成');
    }

    /**
     * 加载单个资源
     */
    public async load<T extends Asset>(
        path: string,
        type: new () => T,
        options: LoadOptions = {}
    ): Promise<T> {
        const opts: Required<LoadOptions> = {
            priority: options.priority ?? 0,
            cache: options.cache ?? true,
            autoRelease: options.autoRelease ?? false,
            bundle: options.bundle ?? 'resources'
        };

        this._stats.totalRequests++;
        const startTime = performance.now();

        // 检查缓存
        const cacheKey = this._getCacheKey(path, type);
        if (opts.cache && this._cache.has(cacheKey)) {
            const ref = this._cache.get(cacheKey)!;
            ref.count++;
            ref.lastUsed = Date.now();
            this._stats.cacheHits++;
            this._stats.totalLoadTime += performance.now() - startTime;
            return ref.asset as T;
        }

        // 检查是否正在加载
        if (this._loading.has(cacheKey)) {
            return this._waitForLoad<T>(cacheKey);
        }

        this._stats.cacheMisses++;

        // 创建加载任务
        return new Promise((resolve, reject) => {
            const task: LoadTask = {
                path,
                type,
                options: opts,
                resolve: resolve as (asset: Asset) => void,
                reject,
                startTime
            };

            this._addToQueue(task);
        });
    }

    /**
     * 批量加载资源
     */
    public async loadBatch(
        requests: Array<{ path: string; type: ResType; options?: LoadOptions }>
    ): Promise<Map<string, Asset>> {
        const results = new Map<string, Asset>();
        const total = requests.length;
        let completed = 0;

        this._eventBus.emit('loading:start', { total });

        const promises = requests.map(async (req) => {
            try {
                const asset = await this.load(req.path, req.type, req.options);
                results.set(req.path, asset);
                completed++;
                this._eventBus.emit('loading:progress', { 
                    current: completed, 
                    total, 
                    percent: Math.floor((completed / total) * 100) 
                });
                return asset;
            } catch (err) {
                error(`[ResLoader] 加载失败: ${req.path}`, err);
                this._eventBus.emit('loading:error', { path: req.path, error: err });
                throw err;
            }
        });

        await Promise.all(promises);
        this._eventBus.emit('loading:complete', undefined);
        
        return results;
    }

    /**
     * 预加载资源（不阻塞）
     */
    public preload(path: string, type: ResType, options: LoadOptions = {}): void {
        this.load(path, type, { ...options, priority: -1 }).catch(err => {
            warn(`[ResLoader] 预加载失败: ${path}`, err);
        });
    }

    /**
     * 释放资源
     */
    public release(path: string, type: ResType, force: boolean = false): boolean {
        const cacheKey = this._getCacheKey(path, type);
        const ref = this._cache.get(cacheKey);
        
        if (!ref) {
            warn(`[ResLoader] 释放不存在的资源: ${path}`);
            return false;
        }

        ref.count--;
        
        if (ref.count <= 0 || force) {
            this._doRelease(cacheKey, ref);
            return true;
        }

        return false;
    }

    /**
     * 批量释放
     */
    public releaseBatch(paths: Array<{ path: string; type: ResType }>): void {
        paths.forEach(p => this.release(p.path, p.type));
    }

    /**
     * 获取缓存的资源
     */
    public getFromCache<T extends Asset>(path: string, type: new () => T): T | null {
        const cacheKey = this._getCacheKey(path, type);
        const ref = this._cache.get(cacheKey);
        return ref ? ref.asset as T : null;
    }

    /**
     * 检查资源是否已缓存
     */
    public isCached(path: string, type: ResType): boolean {
        const cacheKey = this._getCacheKey(path, type);
        return this._cache.has(cacheKey);
    }

    /**
     * 获取资源的引用计数
     */
    public getRefCount(path: string, type: ResType): number {
        const cacheKey = this._getCacheKey(path, type);
        const ref = this._cache.get(cacheKey);
        return ref ? ref.count : 0;
    }

    /**
     * 清空所有缓存
     */
    public clearCache(force: boolean = false): void {
        this._cache.forEach((ref, key) => {
            if (force || ref.count <= 0) {
                this._doRelease(key, ref);
            }
        });
        
        if (force) {
            this._cache.clear();
        }
        
        console.log('[ResLoader] 缓存已清空');
    }

    /**
     * 获取统计信息
     */
    public getStats(): object {
        const cacheSize = this._cache.size;
        const totalMemory = this._estimateMemory();
        
        return {
            ...this._stats,
            cacheSize,
            loadingCount: this._loading.size,
            queueLength: this._loadQueue.length,
            estimatedMemoryMB: totalMemory.toFixed(2),
            cacheHitRate: this._stats.totalRequests > 0
                ? ((this._stats.cacheHits / this._stats.totalRequests) * 100).toFixed(2) + '%'
                : '0%',
            avgLoadTime: this._stats.cacheMisses > 0
                ? (this._stats.totalLoadTime / this._stats.cacheMisses).toFixed(2) + 'ms'
                : '0ms'
        };
    }

    /**
     * 添加到加载队列
     */
    private _addToQueue(task: LoadTask): void {
        // 根据优先级插入队列
        const index = this._loadQueue.findIndex(t => t.options.priority < task.options.priority);
        if (index === -1) {
            this._loadQueue.push(task);
        } else {
            this._loadQueue.splice(index, 0, task);
        }

        this._processQueue();
    }

    /**
     * 处理加载队列
     */
    private _processQueue(): void {
        if (this._loadQueue.length === 0) return;
        if (this._loading.size >= this.maxConcurrency) return;

        const task = this._loadQueue.shift()!;
        const cacheKey = this._getCacheKey(task.path, task.type);
        
        this._loading.add(cacheKey);
        this._doLoad(task);
    }

    /**
     * 执行加载
     */
    private _doLoad(task: LoadTask): void {
        const cacheKey = this._getCacheKey(task.path, task.type);
        const bundle = assetManager.getBundle(task.options.bundle) || resources;

        bundle.load(task.path, task.type, (err, asset) => {
            this._loading.delete(cacheKey);
            
            if (err) {
                this._stats.errors++;
                this._eventBus.emit('loading:error', { path: task.path, error: err });
                task.reject(new Error(`加载失败: ${task.path} - ${err.message}`));
            } else {
                // 缓存资源
                if (task.options.cache) {
                    this._cache.set(cacheKey, {
                        asset,
                        count: 1,
                        lastUsed: Date.now(),
                        autoRelease: task.options.autoRelease
                    });
                }

                this._stats.totalLoadTime += performance.now() - task.startTime;
                task.resolve(asset);
            }

            // 继续处理队列
            this._processQueue();
        });
    }

    /**
     * 等待正在加载的资源
     */
    private _waitForLoad<T extends Asset>(cacheKey: string): Promise<T> {
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (!this._loading.has(cacheKey)) {
                    clearInterval(checkInterval);
                    
                    const ref = this._cache.get(cacheKey);
                    if (ref) {
                        ref.count++;
                        resolve(ref.asset as T);
                    } else {
                        reject(new Error('加载失败'));
                    }
                }
            }, 50);

            // 超时处理
            setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error('加载超时'));
            }, 30000);
        });
    }

    /**
     * 执行释放
     */
    private _doRelease(key: string, ref: AssetRef): void {
        if (ref.asset.isValid) {
            assetManager.releaseAsset(ref.asset);
        }
        this._cache.delete(key);
    }

    /**
     * 获取缓存键
     */
    private _getCacheKey(path: string, type: ResType): string {
        return `${path}#${type.name}`;
    }

    /**
     * 估计内存使用
     */
    private _estimateMemory(): number {
        let total = 0;
        this._cache.forEach(ref => {
            if (ref.asset instanceof Texture2D) {
                const tex = ref.asset as Texture2D;
                const pixels = tex.width * tex.height;
                total += pixels * 4 / (1024 * 1024); // 假设RGBA
            }
        });
        return total;
    }

    /**
     * 启动自动清理
     */
    private _startAutoClean(): void {
        if (this._cleanTimer) return;
        
        this._cleanTimer = window.setInterval(() => {
            this._autoClean();
        }, this.autoCleanInterval * 1000);
    }

    /**
     * 自动清理
     */
    private _autoClean(): void {
        const now = Date.now();
        const expiredKeys: string[] = [];
        
        this._cache.forEach((ref, key) => {
            // 清理长时间未使用且引用为0的资源
            if (ref.count <= 0 && ref.autoRelease) {
                if (now - ref.lastUsed > 60000) { // 1分钟未使用
                    expiredKeys.push(key);
                }
            }
        });

        expiredKeys.forEach(key => {
            const ref = this._cache.get(key);
            if (ref) {
                this._doRelease(key, ref);
            }
        });

        if (expiredKeys.length > 0) {
            console.log(`[ResLoader] 自动清理了 ${expiredKeys.length} 个资源`);
        }
    }

    /**
     * 场景切换处理
     */
    private _onSceneChange(): void {
        // 清理自动释放的资源
        this._autoClean();
    }

    /**
     * 销毁
     */
    protected onDestroy(): void {
        if (this._cleanTimer) {
            clearInterval(this._cleanTimer);
        }
        
        director.off(director.EVENT_BEFORE_SCENE_LAUNCH, this._onSceneChange, this);
        this.clearCache(true);
        
        console.log('[ResLoader] 已销毁');
    }
}

/**
 * 便捷函数
 */
export function getResLoader(): ResLoader {
    return ResLoader.getInstance();
}

/**
 * 加载并实例化Prefab
 */
export async function loadPrefab(path: string, options?: LoadOptions): Promise<Prefab | null> {
    try {
        return await ResLoader.getInstance().load(path, Prefab, options);
    } catch (err) {
        error('[ResLoader] 加载Prefab失败:', path, err);
        return null;
    }
}

/**
 * 加载SpriteFrame
 */
export async function loadSpriteFrame(path: string, options?: LoadOptions): Promise<SpriteFrame | null> {
    try {
        return await ResLoader.getInstance().load(path, SpriteFrame, options);
    } catch (err) {
        error('[ResLoader] 加载SpriteFrame失败:', path, err);
        return null;
    }
}

/**
 * 加载JSON配置
 */
export async function loadJson(path: string, options?: LoadOptions): Promise<any | null> {
    try {
        const asset = await ResLoader.getInstance().load(path, JsonAsset, options);
        return asset.json;
    } catch (err) {
        error('[ResLoader] 加载JSON失败:', path, err);
        return null;
    }
}
