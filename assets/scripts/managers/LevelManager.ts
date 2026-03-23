/**
 * LevelManager.ts
 * 关卡管理器 - 关卡加载、进度、评分管理
 * 
 * 特性：
 * - 关卡数据管理
 * - 进度追踪
 * - 星级评分
 * - 解锁控制
 * - 关卡编辑支持
 */

import { 
    _decorator,
    JsonAsset,
    warn,
    error,
    Vec3
} from 'cc';
import { Singleton } from '../core/Singleton';
import { EventBus } from '../core/EventBus';
import { ResLoader } from '../core/ResLoader';

const { ccclass, property } = _decorator;

/** 关卡元数据 */
export interface LevelMeta {
    id: number;
    name: string;
    difficulty: 1 | 2 | 3 | 4 | 5;
    unlockCondition?: number;
    hint?: string;
    targetMoves?: number;       // 目标步数（三星评价）
    targetTime?: number;        // 目标时间（秒）
    packId?: string;            // 所属关卡包
}

/** 网格位置 */
export interface GridPos {
    x: number;
    y: number;
}

/** 实体数据 */
export interface EntityData {
    id: string;
    type: 'player' | 'block' | 'rule_text' | 'switch' | 'door' | 'goal' | 'obstacle';
    position: GridPos;
    properties: Record<string, any>;
    rules?: RuleData[];
}

/** 规则数据 (Baba Is You风格) */
export interface RuleData {
    subject: string;
    verb: 'IS' | 'HAS' | 'MAKE';
    object: string;
}

/** 胜利条件 */
export interface WinCondition {
    type: 'reach_goal' | 'destroy_all' | 'custom_rule';
    params?: any;
}

/** 环境设置 */
export interface EnvironmentData {
    background: string;
    music: string;
    ambient?: string;
    lighting?: 'normal' | 'dim' | 'dark';
}

/** 完整关卡数据 */
export interface LevelData {
    meta: LevelMeta;
    grid: {
        width: number;
        height: number;
        cellSize: number;
    };
    entities: EntityData[];
    winCondition: WinCondition;
    environment: EnvironmentData;
}

/** 关卡进度 */
export interface LevelProgress {
    levelId: number;
    completed: boolean;
    stars: number;
    bestMoves: number;
    bestTime: number;
    unlocked: boolean;
}

/** 关卡评分结果 */
export interface LevelResult {
    levelId: number;
    stars: number;
    moves: number;
    time: number;
    newRecord: boolean;
}

/**
 * 关卡管理器
 */
@ccclass('LevelManager')
export class LevelManager extends Singleton<LevelManager> {
    /** 关卡总数 */
    private readonly TOTAL_LEVELS: number = 40;

    /** 关卡数据缓存 */
    private _levelCache: Map<number, LevelData> = new Map();

    /** 关卡进度数据 */
    private _levelProgress: Map<number, LevelProgress> = new Map();

    /** 当前关卡数据 */
    private _currentLevel: LevelData | null = null;

    /** 当前关卡统计 */
    private _currentStats = {
        moves: 0,
        startTime: 0,
        entityStates: new Map<string, any>()
    };

    /** 事件总线 */
    private _eventBus: EventBus;

    /** 资源加载器 */
    private _resLoader: ResLoader;

    /**
     * 初始化
     */
    protected onInitialize(): void {
        this._eventBus = EventBus.getInstance();
        this._resLoader = ResLoader.getInstance();
        this._initProgressData();
        
        console.log('[LevelManager] 初始化完成');
    }

    /**
     * 初始化进度数据
     */
    private _initProgressData(): void {
        for (let i = 1; i <= this.TOTAL_LEVELS; i++) {
            this._levelProgress.set(i, {
                levelId: i,
                completed: false,
                stars: 0,
                bestMoves: Infinity,
                bestTime: Infinity,
                unlocked: i === 1 // 第一关默认解锁
            });
        }
    }

    /**
     * 预加载关卡
     */
    public async preloadLevel(levelId: number): Promise<boolean> {
        if (levelId < 1 || levelId > this.TOTAL_LEVELS) {
            warn(`[LevelManager] 无效的关卡ID: ${levelId}`);
            return false;
        }

        // 检查缓存
        if (this._levelCache.has(levelId)) {
            return true;
        }

        // 加载关卡数据
        const levelData = await this._loadLevelData(levelId);
        if (!levelData) {
            error(`[LevelManager] 关卡数据加载失败: ${levelId}`);
            return false;
        }

        this._levelCache.set(levelId, levelData);

        // 预加载关卡资源
        await this._preloadLevelResources(levelData);

        console.log(`[LevelManager] 关卡 ${levelId} 预加载完成`);
        return true;
    }

    /**
     * 开始关卡
     */
    public async startLevel(levelId: number): Promise<boolean> {
        const success = await this.preloadLevel(levelId);
        if (!success) return false;

        const levelData = this._levelCache.get(levelId)!;
        this._currentLevel = levelData;

        // 重置统计
        this._currentStats = {
            moves: 0,
            startTime: Date.now(),
            entityStates: new Map()
        };

        // 发送事件
        this._eventBus.emit('level:start', { levelId });

        console.log(`[LevelManager] 关卡 ${levelId} 开始`);
        return true;
    }

    /**
     * 获取当前关卡数据
     */
    public getCurrentLevel(): LevelData | null {
        return this._currentLevel;
    }

    /**
     * 获取关卡数据
     */
    public getLevelData(levelId: number): LevelData | null {
        return this._levelCache.get(levelId) || null;
    }

    /**
     * 记录步数
     */
    public recordMove(): void {
        this._currentStats.moves++;
    }

    /**
     * 获取当前步数
     */
    public getCurrentMoves(): number {
        return this._currentStats.moves;
    }

    /**
     * 获取当前时间
     */
    public getCurrentTime(): number {
        return Math.floor((Date.now() - this._currentStats.startTime) / 1000);
    }

    /**
     * 完成关卡
     */
    public completeLevel(): LevelResult {
        if (!this._currentLevel) {
            throw new Error('没有正在进行的关卡');
        }

        const levelId = this._currentLevel.meta.id;
        const moves = this._currentStats.moves;
        const time = this.getCurrentTime();

        // 计算星级
        const stars = this._calculateStars(moves, time);

        // 更新进度
        const progress = this._levelProgress.get(levelId)!;
        const newRecord = moves < progress.bestMoves || time < progress.bestTime;

        progress.completed = true;
        progress.stars = Math.max(progress.stars, stars);
        progress.bestMoves = Math.min(progress.bestMoves, moves);
        progress.bestTime = Math.min(progress.bestTime, time);

        // 解锁下一关
        if (levelId < this.TOTAL_LEVELS) {
            const nextProgress = this._levelProgress.get(levelId + 1)!;
            nextProgress.unlocked = true;
        }

        const result: LevelResult = {
            levelId,
            stars,
            moves,
            time,
            newRecord
        };

        this._eventBus.emit('level:complete', result);

        console.log(`[LevelManager] 关卡 ${levelId} 完成:`, result);
        return result;
    }

    /**
     * 失败关卡
     */
    public failLevel(reason: string): void {
        if (!this._currentLevel) return;

        const levelId = this._currentLevel.meta.id;
        
        this._eventBus.emit('level:fail', { levelId, reason });
        console.log(`[LevelManager] 关卡 ${levelId} 失败: ${reason}`);
    }

    /**
     * 计算星级
     */
    private _calculateStars(moves: number, time: number): number {
        if (!this._currentLevel) return 0;

        const targetMoves = this._currentLevel.meta.targetMoves || Infinity;

        // 三星：步数 <= 目标步数
        if (moves <= targetMoves) return 3;
        
        // 二星：步数 <= 目标步数 * 1.5
        if (moves <= targetMoves * 1.5) return 2;
        
        // 一星：完成即可
        return 1;
    }

    /**
     * 检查关卡是否解锁
     */
    public isLevelUnlocked(levelId: number): boolean {
        const progress = this._levelProgress.get(levelId);
        return progress?.unlocked || false;
    }

    /**
     * 检查关卡是否存在
     */
    public isLevelExist(levelId: number): boolean {
        return levelId >= 1 && levelId <= this.TOTAL_LEVELS;
    }

    /**
     * 获取关卡进度
     */
    public getLevelProgress(levelId: number): LevelProgress | null {
        return this._levelProgress.get(levelId) || null;
    }

    /**
     * 获取所有关卡进度
     */
    public getAllProgress(): LevelProgress[] {
        return Array.from(this._levelProgress.values());
    }

    /**
     * 获取已解锁关卡数
     */
    public getUnlockedCount(): number {
        let count = 0;
        this._levelProgress.forEach(p => {
            if (p.unlocked) count++;
        });
        return count;
    }

    /**
     * 获取已完成关卡数
     */
    public getCompletedCount(): number {
        let count = 0;
        this._levelProgress.forEach(p => {
            if (p.completed) count++;
        });
        return count;
    }

    /**
     * 获取总星星数
     */
    public getTotalStars(): number {
        let total = 0;
        this._levelProgress.forEach(p => {
            total += p.stars;
        });
        return total;
    }

    /**
     * 加载关卡数据
     */
    private async _loadLevelData(levelId: number): Promise<LevelData | null> {
        const path = `levels/${this._getLevelFileName(levelId)}`;
        
        try {
            const json = await this._resLoader.load(path, JsonAsset);
            if (!json) return null;

            const data = json.json as LevelData;
            
            // 验证数据完整性
            if (!this._validateLevelData(data)) {
                error(`[LevelManager] 关卡数据验证失败: ${levelId}`);
                return null;
            }

            return data;
        } catch (err) {
            error(`[LevelManager] 加载关卡数据失败: ${levelId}`, err);
            return null;
        }
    }

    /**
     * 预加载关卡资源
     */
    private async _preloadLevelResources(levelData: LevelData): Promise<void> {
        const resources: string[] = [];

        // 收集需要预加载的资源
        if (levelData.environment.background) {
            resources.push(`textures/backgrounds/${levelData.environment.background}`);
        }
        if (levelData.environment.music) {
            resources.push(`audio/bgm/${levelData.environment.music}`);
        }

        // TODO: 预加载实体资源

        // 批量加载
        if (resources.length > 0) {
            // await this._resLoader.loadBatch(resources.map(r => ({ path: r, type: Asset })));
        }
    }

    /**
     * 获取关卡文件名
     */
    private _getLevelFileName(levelId: number): string {
        // 每10关一个文件，减少请求数
        const packId = Math.ceil(levelId / 10);
        const packIndex = (levelId - 1) % 10;
        return `pack_${packId}.json`;
    }

    /**
     * 验证关卡数据
     */
    private _validateLevelData(data: any): boolean {
        if (!data.meta || !data.grid || !data.entities || !data.winCondition) {
            return false;
        }

        if (typeof data.meta.id !== 'number') return false;
        if (typeof data.grid.width !== 'number') return false;
        if (typeof data.grid.height !== 'number') return false;
        if (!Array.isArray(data.entities)) return false;

        return true;
    }

    /**
     * 解析关卡数据（从JSON）
     */
    public parseLevelData(json: string): LevelData | null {
        try {
            const data = JSON.parse(json) as LevelData;
            if (this._validateLevelData(data)) {
                return data;
            }
        } catch (err) {
            error('[LevelManager] 解析关卡数据失败', err);
        }
        return null;
    }

    /**
     * 导出关卡数据（用于编辑器）
     */
    public exportLevelData(levelData: LevelData): string {
        return JSON.stringify(levelData, null, 2);
    }

    /**
     * 加载外部进度数据
     */
    public loadProgressData(progressList: LevelProgress[]): void {
        progressList.forEach(p => {
            if (this._levelProgress.has(p.levelId)) {
                this._levelProgress.set(p.levelId, p);
            }
        });
    }

    /**
     * 导出进度数据
     */
    public exportProgressData(): LevelProgress[] {
        return this.getAllProgress();
    }

    /**
     * 销毁
     */
    protected onDestroy(): void {
        this._levelCache.clear();
        this._levelProgress.clear();
        this._currentLevel = null;
        
        console.log('[LevelManager] 已销毁');
    }
}
