/**
 * SaveManager.ts
 * 存档管理器 - 游戏数据持久化
 * 
 * 特性：
 * - 本地存储
 * - 云存档同步
 * - 存档加密
 * - 多槽位支持
 * - 自动备份
 */

import { 
    _decorator,
    sys,
    warn,
    error
} from 'cc';
import { Singleton } from '../core/Singleton';
import { EventBus } from '../core/EventBus';
import { WXAdapter } from '../platform/WXAdapter';
import { GameData, GameSettings } from './GameManager';
import { LevelProgress } from './LevelManager';

const { ccclass, property } = _decorator;

/** 存档数据版本 */
const SAVE_VERSION = '1.0.0';

/** 存档数据 */
export interface SaveData {
    version: string;
    timestamp: number;
    gameData: GameData;
    levelProgress: LevelProgress[];
}

/** 云存档数据 */
export interface CloudSaveData {
    data: string;           // 加密后的数据
    checksum: string;       // 校验和
    timestamp: number;      // 时间戳
    deviceId: string;       // 设备标识
}

/** 存档槽位 */
export enum SaveSlot {
    AUTO = 'auto',           // 自动存档
    SLOT1 = 'slot1',         // 槽位1
    SLOT2 = 'slot2',         // 槽位2
    SLOT3 = 'slot3'          // 槽位3
}

/**
 * 存档管理器
 */
@ccclass('SaveManager')
export class SaveManager extends Singleton<SaveManager> {
    /** 存档键名前缀 */
    private readonly SAVE_KEY_PREFIX = 'puzzle_game_save_';
    
    /** 设置键名 */
    private readonly SETTINGS_KEY = 'puzzle_game_settings';

    /** 当前存档数据 */
    private _currentSave: SaveData | null = null;

    /** 是否支持云存档 */
    private _cloudSaveEnabled: boolean = false;

    /** 自动存档间隔(秒) */
    private readonly AUTO_SAVE_INTERVAL = 60;

    /** 自动存档定时器 */
    private _autoSaveTimer: number | null = null;

    /** 事件总线 */
    private _eventBus: EventBus;

    /**
     * 初始化
     */
    protected onInitialize(): void {
        this._eventBus = EventBus.getInstance();
        this._checkCloudSave();
        this._startAutoSave();
        
        console.log('[SaveManager] 初始化完成');
    }

    /**
     * 检查云存档支持
     */
    private _checkCloudSave(): void {
        this._cloudSaveEnabled = WXAdapter.isCloudSaveSupported();
        console.log(`[SaveManager] 云存档支持: ${this._cloudSaveEnabled}`);
    }

    /**
     * 保存游戏
     */
    public async saveGame(gameData: GameData): Promise<boolean> {
        try {
            const saveData: SaveData = {
                version: SAVE_VERSION,
                timestamp: Date.now(),
                gameData,
                levelProgress: [] // TODO: 从LevelManager获取
            };

            // 保存到本地
            const success = this._saveToLocal(saveData);
            if (!success) return false;

            this._currentSave = saveData;

            // 同步到云端
            if (this._cloudSaveEnabled) {
                await this._syncToCloud(saveData);
            }

            console.log('[SaveManager] 游戏已保存');
            return true;
        } catch (err) {
            error('[SaveManager] 保存游戏失败', err);
            return false;
        }
    }

    /**
     * 加载游戏
     */
    public async loadGame(): Promise<GameData | null> {
        try {
            // 尝试从云端加载
            if (this._cloudSaveEnabled) {
                const cloudData = await this._loadFromCloud();
                if (cloudData) {
                    // 比较时间戳，使用最新的
                    const localData = this._loadFromLocal();
                    if (!localData || cloudData.timestamp > localData.timestamp) {
                        this._currentSave = cloudData;
                        console.log('[SaveManager] 从云端加载存档');
                        return cloudData.gameData;
                    }
                }
            }

            // 从本地加载
            const localData = this._loadFromLocal();
            if (localData) {
                this._currentSave = localData;
                console.log('[SaveManager] 从本地加载存档');
                return localData.gameData;
            }

            console.log('[SaveManager] 没有找到存档');
            return null;
        } catch (err) {
            error('[SaveManager] 加载游戏失败', err);
            return null;
        }
    }

    /**
     * 保存设置
     */
    public saveSettings(settings: GameSettings): boolean {
        try {
            const data = JSON.stringify(settings);
            sys.localStorage.setItem(this.SETTINGS_KEY, data);
            console.log('[SaveManager] 设置已保存');
            return true;
        } catch (err) {
            error('[SaveManager] 保存设置失败', err);
            return false;
        }
    }

    /**
     * 加载设置
     */
    public loadSettings(): GameSettings | null {
        try {
            const data = sys.localStorage.getItem(this.SETTINGS_KEY);
            if (data) {
                return JSON.parse(data) as GameSettings;
            }
            return null;
        } catch (err) {
            error('[SaveManager] 加载设置失败', err);
            return null;
        }
    }

    /**
     * 保存到指定槽位
     */
    public async saveToSlot(gameData: GameData, slot: SaveSlot): Promise<boolean> {
        try {
            const saveData: SaveData = {
                version: SAVE_VERSION,
                timestamp: Date.now(),
                gameData,
                levelProgress: []
            };

            const key = this._getSaveKey(slot);
            const data = JSON.stringify(saveData);
            sys.localStorage.setItem(key, data);

            console.log(`[SaveManager] 已保存到槽位 ${slot}`);
            return true;
        } catch (err) {
            error(`[SaveManager] 保存到槽位 ${slot} 失败`, err);
            return false;
        }
    }

    /**
     * 从槽位加载
     */
    public loadFromSlot(slot: SaveSlot): GameData | null {
        try {
            const key = this._getSaveKey(slot);
            const data = sys.localStorage.getItem(key);
            
            if (data) {
                const saveData = JSON.parse(data) as SaveData;
                console.log(`[SaveManager] 从槽位 ${slot} 加载存档`);
                return saveData.gameData;
            }

            return null;
        } catch (err) {
            error(`[SaveManager] 从槽位 ${slot} 加载失败`, err);
            return null;
        }
    }

    /**
     * 删除存档
     */
    public deleteSave(slot?: SaveSlot): boolean {
        try {
            if (slot) {
                const key = this._getSaveKey(slot);
                sys.localStorage.removeItem(key);
                console.log(`[SaveManager] 已删除槽位 ${slot} 的存档`);
            } else {
                // 删除所有存档
                this._clearAllSaves();
                console.log('[SaveManager] 已删除所有存档');
            }
            return true;
        } catch (err) {
            error('[SaveManager] 删除存档失败', err);
            return false;
        }
    }

    /**
     * 检查是否有存档
     */
    public hasSave(slot?: SaveSlot): boolean {
        if (slot) {
            const key = this._getSaveKey(slot);
            return sys.localStorage.getItem(key) !== null;
        }

        // 检查任意槽位
        return Object.values(SaveSlot).some(s => this.hasSave(s));
    }

    /**
     * 获取存档信息
     */
    public getSaveInfo(slot: SaveSlot): { exists: boolean; timestamp?: number } {
        try {
            const key = this._getSaveKey(slot);
            const data = sys.localStorage.getItem(key);
            
            if (data) {
                const saveData = JSON.parse(data) as SaveData;
                return { exists: true, timestamp: saveData.timestamp };
            }

            return { exists: false };
        } catch {
            return { exists: false };
        }
    }

    /**
     * 导出存档数据
     */
    public exportSaveData(): string | null {
        if (!this._currentSave) return null;
        return JSON.stringify(this._currentSave);
    }

    /**
     * 导入存档数据
     */
    public importSaveData(json: string): SaveData | null {
        try {
            const data = JSON.parse(json) as SaveData;
            
            // 验证版本
            if (data.version !== SAVE_VERSION) {
                warn(`[SaveManager] 存档版本不匹配: ${data.version} vs ${SAVE_VERSION}`);
                // TODO: 版本转换
            }

            this._currentSave = data;
            return data;
        } catch (err) {
            error('[SaveManager] 导入存档失败', err);
            return null;
        }
    }

    /**
     * 保存到本地
     */
    private _saveToLocal(saveData: SaveData): boolean {
        try {
            const key = this._getSaveKey(SaveSlot.AUTO);
            const data = JSON.stringify(saveData);
            sys.localStorage.setItem(key, data);
            return true;
        } catch (err) {
            error('[SaveManager] 本地保存失败', err);
            return false;
        }
    }

    /**
     * 从本地加载
     */
    private _loadFromLocal(): SaveData | null {
        try {
            const key = this._getSaveKey(SaveSlot.AUTO);
            const data = sys.localStorage.getItem(key);
            
            if (data) {
                return JSON.parse(data) as SaveData;
            }

            return null;
        } catch (err) {
            error('[SaveManager] 本地加载失败', err);
            return null;
        }
    }

    /**
     * 同步到云端
     */
    private async _syncToCloud(saveData: SaveData): Promise<boolean> {
        try {
            const data = JSON.stringify(saveData);
            const encrypted = this._encrypt(data);
            const checksum = this._calcChecksum(data);

            const cloudData: CloudSaveData = {
                data: encrypted,
                checksum,
                timestamp: saveData.timestamp,
                deviceId: this._getDeviceId()
            };

            return await WXAdapter.saveToCloud(cloudData);
        } catch (err) {
            error('[SaveManager] 云端同步失败', err);
            return false;
        }
    }

    /**
     * 从云端加载
     */
    private async _loadFromCloud(): Promise<SaveData | null> {
        try {
            const cloudData = await WXAdapter.loadFromCloud();
            if (!cloudData) return null;

            // 验证校验和
            const decrypted = this._decrypt(cloudData.data);
            const checksum = this._calcChecksum(decrypted);
            
            if (checksum !== cloudData.checksum) {
                warn('[SaveManager] 云端存档校验失败');
                return null;
            }

            return JSON.parse(decrypted) as SaveData;
        } catch (err) {
            error('[SaveManager] 云端加载失败', err);
            return null;
        }
    }

    /**
     * 获取存档键名
     */
    private _getSaveKey(slot: SaveSlot): string {
        return `${this.SAVE_KEY_PREFIX}${slot}`;
    }

    /**
     * 清除所有存档
     */
    private _clearAllSaves(): void {
        Object.values(SaveSlot).forEach(slot => {
            const key = this._getSaveKey(slot);
            sys.localStorage.removeItem(key);
        });
    }

    /**
     * 启动自动存档
     */
    private _startAutoSave(): void {
        if (this._autoSaveTimer) {
            clearInterval(this._autoSaveTimer);
        }

        this._autoSaveTimer = window.setInterval(() => {
            this._eventBus.emit('save:auto_save');
        }, this.AUTO_SAVE_INTERVAL * 1000);
    }

    /**
     * 简单加密（Base64）
     * TODO: 使用更安全的加密方式
     */
    private _encrypt(data: string): string {
        return btoa(encodeURIComponent(data));
    }

    /**
     * 解密
     */
    private _decrypt(data: string): string {
        return decodeURIComponent(atob(data));
    }

    /**
     * 计算校验和（简单实现）
     */
    private _calcChecksum(data: string): string {
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    /**
     * 获取设备ID
     */
    private _getDeviceId(): string {
        let deviceId = sys.localStorage.getItem('puzzle_game_device_id');
        if (!deviceId) {
            deviceId = this._generateDeviceId();
            sys.localStorage.setItem('puzzle_game_device_id', deviceId);
        }
        return deviceId;
    }

    /**
     * 生成设备ID
     */
    private _generateDeviceId(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * 销毁
     */
    protected onDestroy(): void {
        if (this._autoSaveTimer) {
            clearInterval(this._autoSaveTimer);
        }
        
        console.log('[SaveManager] 已销毁');
    }
}

/**
 * 便捷函数：获取SaveManager实例
 */
export function getSaveManager(): SaveManager {
    return SaveManager.getInstance();
}
