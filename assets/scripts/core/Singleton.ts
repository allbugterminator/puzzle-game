/**
 * Singleton.ts
 * 单例基类 - 提供线程安全的单例模式实现
 * 
 * 使用方式：
 * class MyManager extends Singleton<MyManager> { ... }
 * const instance = MyManager.getInstance();
 */

export abstract class Singleton<T> {
    private static _instances: Map<string, any> = new Map();
    private static _creationLocks: Map<string, boolean> = new Map();

    /**
     * 获取单例实例
     * 使用双检锁确保线程安全
     */
    public static getInstance<T>(this: new () => T): T {
        const className = this.name;
        
        // 快速检查：已存在实例直接返回
        if (Singleton._instances.has(className)) {
            return Singleton._instances.get(className);
        }

        // 检查是否正在创建中（防止循环依赖）
        if (Singleton._creationLocks.get(className)) {
            throw new Error(`[Singleton] 检测到循环依赖: ${className}`);
        }

        // 加锁创建
        Singleton._creationLocks.set(className, true);
        
        try {
            const instance = new this();
            Singleton._instances.set(className, instance);
            
            // 调用初始化方法
            if (typeof (instance as any).onInitialize === 'function') {
                (instance as any).onInitialize();
            }
            
            console.log(`[Singleton] ${className} 实例已创建`);
            return instance;
        } finally {
            Singleton._creationLocks.delete(className);
        }
    }

    /**
     * 检查实例是否存在
     */
    public static hasInstance<T>(this: new () => T): boolean {
        return Singleton._instances.has(this.name);
    }

    /**
     * 销毁单例实例
     */
    public static destroyInstance<T>(this: new () => T): void {
        const className = this.name;
        const instance = Singleton._instances.get(className);
        
        if (instance && typeof (instance as any).onDestroy === 'function') {
            (instance as any).onDestroy();
        }
        
        Singleton._instances.delete(className);
        console.log(`[Singleton] ${className} 实例已销毁`);
    }

    /**
     * 销毁所有单例
     */
    public static destroyAll(): void {
        Singleton._instances.forEach((instance, className) => {
            if (instance && typeof instance.onDestroy === 'function') {
                instance.onDestroy();
            }
        });
        Singleton._instances.clear();
        console.log('[Singleton] 所有实例已销毁');
    }

    /**
     * 获取所有单例信息（调试用）
     */
    public static getInstanceInfo(): string[] {
        return Array.from(Singleton._instances.keys());
    }

    /**
     * 子类可重写的初始化方法
     */
    protected onInitialize?(): void;

    /**
     * 子类可重写的销毁方法
     */
    protected onDestroy?(): void;

    /**
     * 防止直接new创建实例
     * 子类构造函数应设为protected
     */
    protected constructor() {
        // 确保只能通过getInstance创建
        const className = (this.constructor as any).name;
        if (!Singleton._creationLocks.get(className)) {
            throw new Error(`[Singleton] ${className} 不能直接实例化，请使用 ${className}.getInstance()`);
        }
    }
}

/**
 * 延迟初始化装饰器
 * 用于标记需要在游戏启动后才初始化的单例
 */
export function LazyInit<T extends { new (...args: any[]): any }>(constructor: T) {
    return class extends constructor {
        private static _lazyInstance: any = null;
        
        public static getInstance(): InstanceType<T> {
            if (!this._lazyInstance) {
                this._lazyInstance = new constructor();
            }
            return this._lazyInstance;
        }
    };
}

/**
 * 自动清理装饰器
 * 用于标记在场景切换时需要自动清理的单例
 */
export function AutoCleanup<T extends { new (...args: any[]): any }>(constructor: T) {
    return class extends constructor {
        constructor(...args: any[]) {
            super(...args);
            // 注册场景切换监听
            // TODO: 需要配合游戏生命周期管理
        }
    };
}
