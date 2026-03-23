/**
 * LevelLoader.ts
 * 关卡加载器 - 加载和解析关卡数据
 */

import { JsonAsset, resources, error, warn, log } from 'cc';
import { LevelData, LevelMeta, EntityData, WinCondition, EnvironmentData } from '../managers/LevelManager';

/**
 * 关卡加载器
 */
export class LevelLoader {
    private static _instance: LevelLoader | null = null;
    private _levelCache: Map<number, LevelData> = new Map();
    private _jsonCache: any = null;

    public static getInstance(): LevelLoader {
        if (!LevelLoader._instance) {
            LevelLoader._instance = new LevelLoader();
        }
        return LevelLoader._instance;
    }

    /**
     * 加载关卡数据
     */
    public async loadLevel(levelId: number): Promise<LevelData | null> {
        // 检查缓存
        if (this._levelCache.has(levelId)) {
            return this._levelCache.get(levelId)!;
        }

        // 加载关卡JSON
        if (!this._jsonCache) {
            const success = await this._loadLevelJson();
            if (!success) return null;
        }

        // 查找关卡
        const levelJson = this._jsonCache.levels.find((l: any) => l.id === levelId);
        if (!levelJson) {
            error(`[LevelLoader] 关卡 ${levelId} 不存在`);
            return null;
        }

        // 解析关卡数据
        const levelData = this._parseLevelData(levelJson);
        this._levelCache.set(levelId, levelData);

        return levelData;
    }

    /**
     * 加载关卡JSON文件
     */
    private async _loadLevelJson(): Promise<boolean> {
        return new Promise((resolve) => {
            resources.load('levels/tutorial_levels', JsonAsset, (err, asset) => {
                if (err) {
                    error('[LevelLoader] 加载关卡JSON失败', err);
                    resolve(false);
                    return;
                }
                this._jsonCache = asset.json;
                log('[LevelLoader] 关卡JSON加载成功');
                resolve(true);
            });
        });
    }

    /**
     * 解析关卡数据
     */
    private _parseLevelData(json: any): LevelData {
        return {
            meta: {
                id: json.id,
                name: json.name,
                difficulty: json.difficulty,
                targetMoves: json.targetMoves,
                hint: json.hint
            } as LevelMeta,
            grid: json.grid,
            entities: json.entities,
            winCondition: json.winCondition,
            environment: json.environment,
            rules: json.rules || []
        };
    }

    /**
     * 获取所有关卡ID
     */
    public async getAllLevelIds(): Promise<number[]> {
        if (!this._jsonCache) {
            await this._loadLevelJson();
        }
        return this._jsonCache.levels.map((l: any) => l.id);
    }

    /**
     * 清空缓存
     */
    public clearCache(): void {
        this._levelCache.clear();
        this._jsonCache = null;
    }
}
