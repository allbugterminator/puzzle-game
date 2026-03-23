/**
 * GameManager.ts
 * 游戏主逻辑管理器 - 控制游戏生命周期和核心流程
 * 
 * 职责：
 * - 游戏状态管理
 * - 场景切换控制
 * - 游戏流程控制
 * - 全局时间管理
 * - 调试工具
 */

import { 
    _decorator, 
    Component, 
    director, 
    Director, 
    game, 
    Game, 
    instantiate, 
    Node, 
    Prefab,
    sys,
    warn 
} from 'cc';
import { Singleton } from '../core/Singleton';
import { EventBus, GameEvents } from '../core/EventBus';
import { SaveManager } from './SaveManager';
import { AudioManager } from './AudioManager';
import { UIManager } from './UIManager';
import { LevelManager } from './LevelManager';

const { ccclass, property } = _decorator;

/** 游戏状态 */
export enum GameState {
    NONE = 'none',
    INITIALIZING = 'initializing',
    BOOT = 'boot',
    HOME = 'home',
    LOADING = 'loading',
    PLAYING = 'playing',
    PAUSED = 'paused',
    LEVEL_COMPLETE = 'level_complete',
    LEVEL_FAILED = 'level_failed',
    GAME_OVER = 'game_over'
}

/** 游戏配置 */
export interface GameConfig {
    /** 目标帧率 */
    targetFrameRate: number;
    /** 是否显示FPS */
    showFPS: boolean;
    /** 是否启用调试 */
    enableDebug: boolean;
    /** 是否启用作弊 */
    enableCheat: boolean;
    /** 音效开关 */
    soundEnabled: boolean;
    /** 音乐开关 */
    musicEnabled: boolean;
    /** 振动开关 */
    vibrationEnabled: boolean;
    /** 适龄提示 */
    ageRating: 'everyone' | 'teen' | 'mature';
}

/** 游戏数据 */
export interface GameData {
    currentLevel: number;
    maxUnlockedLevel: number;
    totalStars: number;
    totalPlayTime: number;
    settings: GameSettings;
}

/** 游戏设置 */
export interface GameSettings {
    soundVolume: number;
    musicVolume: number;
    vibration: boolean;
    quality: 'low' | 'medium' | 'high';
}

/**
 * 游戏管理器
 * 单例模式管理游戏全局状态
 */
@ccclass('GameManager')
export class GameManager extends Singleton<GameManager> {
    /** 当前游戏状态 */
    private _state: GameState = GameState.NONE;
    
    /** 游戏配置 */
    private _config: GameConfig = {
        targetFrameRate: 60,
        showFPS: false,
        enableDebug: false,
        enableCheat: false,
        soundEnabled: true,
        musicEnabled: true,
        vibrationEnabled: true,
        ageRating: 'everyone'
    };

    /** 游戏数据 */
    private _data: GameData = {
        currentLevel: 1,
        maxUnlockedLevel: 1,
        totalStars: 0,
        totalPlayTime: 0,
        settings: {
            soundVolume: 1.0,
            musicVolume: 0.7,
            vibration: true,
            quality: 'medium'
        }
    };

    /** 事件总线 */
    private _eventBus: EventBus;
    
    /** 存档管理器 */
    private _saveManager: SaveManager;
    
    /** 音频管理器 */
    private _audioManager: AudioManager;
    
    /** UI管理器 */
    private _uiManager: UIManager;
    
    /** 关卡管理器 */
    private _levelManager: LevelManager;

    /** 游戏启动时间 */
    private _startTime: number = 0;
    
    /** 当前场景名 */
    private _currentScene: string = '';
    
    /** 是否已初始化 */
    private _initialized: boolean = false;

    /**
     * 初始化
     */
    protected onInitialize(): void {
        this._eventBus = EventBus.getInstance();
        this._startTime = Date.now();
        
        console.log('[GameManager] 初始化完成');
    }

    /**
     * 启动游戏
     */
    public async boot(): Promise<void> {
        if (this._initialized) {
            warn('[GameManager] 游戏已启动，跳过重复启动');
            return;
        }

        this.setState(GameState.INITIALIZING);
        
        // 初始化子系统
        await this._initSubsystems();
        
        // 加载存档
        await this._loadSaveData();
        
        // 应用设置
        this._applySettings();
        
        this._initialized = true;
        this.setState(GameState.BOOT);
        
        // 进入主界面
        this.enterHome();
        
        console.log('[GameManager] 游戏启动完成');
    }

    /**
     * 初始化子系统
     */
    private async _initSubsystems(): Promise<void> {
        // 获取各管理器实例
        this._saveManager = SaveManager.getInstance();
        this._audioManager = AudioManager.getInstance();
        this._uiManager = UIManager.getInstance();
        this._levelManager = LevelManager.getInstance();

        // 设置游戏生命周期监听
        game.on(Game.EVENT_HIDE, this._onGameHide, this);
        game.on(Game.EVENT_SHOW, this._onGameShow, this);
        
        console.log('[GameManager] 子系统初始化完成');
    }

    /**
     * 加载存档数据
     */
    private async _loadSaveData(): Promise<void> {
        const saveData = await this._saveManager.loadGame();
        if (saveData) {
            this._data = { ...this._data, ...saveData };
        }
        console.log('[GameManager] 存档加载完成:', this._data);
    }

    /**
     * 应用游戏设置
     */
    private _applySettings(): void {
        // 设置帧率
        game.setFrameRate(this._config.targetFrameRate);
        
        // 应用音频设置
        this._audioManager.setSoundVolume(this._data.settings.soundVolume);
        this._audioManager.setMusicVolume(this._data.settings.musicVolume);
        
        console.log('[GameManager] 设置已应用');
    }

    /**
     * 设置游戏状态
     */
    public setState(newState: GameState): void {
        const oldState = this._state;
        this._state = newState;
        
        console.log(`[GameManager] 状态变化: ${oldState} -> ${newState}`);
        
        // 发送状态变化事件
        this._eventBus.emit('game:state_change', { 
            from: oldState, 
            to: newState 
        });

        // 根据状态执行相应逻辑
        this._onStateChange(oldState, newState);
    }

    /**
     * 状态变化处理
     */
    private _onStateChange(from: GameState, to: GameState): void {
        switch (to) {
            case GameState.PAUSED:
                director.pause();
                this._audioManager.pauseAll();
                break;
                
            case GameState.PLAYING:
                director.resume();
                this._audioManager.resumeAll();
                break;
                
            case GameState.LEVEL_COMPLETE:
                this._handleLevelComplete();
                break;
                
            case GameState.LEVEL_FAILED:
                this._handleLevelFailed();
                break;
        }
    }

    /**
     * 进入主界面
     */
    public async enterHome(): Promise<void> {
        this.setState(GameState.HOME);
        await this.loadScene('Home');
        this._eventBus.emit('game:home');
    }

    /**
     * 开始游戏
     */
    public async startGame(levelId?: number): Promise<void> {
        const targetLevel = levelId || this._data.currentLevel;
        
        if (!this._levelManager.isLevelUnlocked(targetLevel)) {
            console.warn(`[GameManager] 关卡 ${targetLevel} 未解锁`);
            return;
        }

        this.setState(GameState.LOADING);
        
        // 预加载关卡资源
        await this._levelManager.preloadLevel(targetLevel);
        
        // 切换到游戏场景
        await this.loadScene('Game');
        
        // 启动关卡
        await this._levelManager.startLevel(targetLevel);
        
        this._data.currentLevel = targetLevel;
        this.setState(GameState.PLAYING);
        
        this._eventBus.emit('game:start');
    }

    /**
     * 暂停游戏
     */
    public pauseGame(): void {
        if (this._state !== GameState.PLAYING) return;
        
        this.setState(GameState.PAUSED);
        this._uiManager.openPanel('PausePanel');
    }

    /**
     * 恢复游戏
     */
    public resumeGame(): void {
        if (this._state !== GameState.PAUSED) return;
        
        this._uiManager.closePanel('PausePanel');
        this.setState(GameState.PLAYING);
    }

    /**
     * 重新开始当前关卡
     */
    public restartLevel(): void {
        if (this._state !== GameState.PLAYING && 
            this._state !== GameState.LEVEL_COMPLETE &&
            this._state !== GameState.LEVEL_FAILED) {
            return;
        }

        this._eventBus.emit('level:restart', { levelId: this._data.currentLevel });
        this.startGame(this._data.currentLevel);
    }

    /**
     * 下一关
     */
    public async nextLevel(): Promise<void> {
        const nextLevelId = this._data.currentLevel + 1;
        
        if (!this._levelManager.isLevelExist(nextLevelId)) {
            // 通关所有关卡
            this._eventBus.emit('game:all_levels_complete');
            this.enterHome();
            return;
        }

        await this.startGame(nextLevelId);
    }

    /**
     * 关卡完成处理
     */
    private _handleLevelComplete(): void {
        const currentLevel = this._data.currentLevel;
        
        // 解锁下一关
        if (currentLevel >= this._data.maxUnlockedLevel) {
            this._data.maxUnlockedLevel = currentLevel + 1;
        }
        
        // 保存进度
        this.saveGame();
        
        // 显示完成界面
        this._uiManager.openPanel('LevelCompletePanel');
    }

    /**
     * 关卡失败处理
     */
    private _handleLevelFailed(): void {
        this._uiManager.openPanel('LevelFailedPanel');
    }

    /**
     * 加载场景
     */
    public async loadScene(sceneName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this._currentScene = sceneName;
            
            director.loadScene(sceneName, (err, scene) => {
                if (err) {
                    console.error(`[GameManager] 场景加载失败: ${sceneName}`, err);
                    reject(err);
                    return;
                }
                
                console.log(`[GameManager] 场景加载完成: ${sceneName}`);
                resolve();
            });
        });
    }

    /**
     * 保存游戏
     */
    public async saveGame(): Promise<boolean> {
        // 更新游戏时间
        this._data.totalPlayTime += Date.now() - this._startTime;
        this._startTime = Date.now();
        
        return await this._saveManager.saveGame(this._data);
    }

    /**
     * 设置配置
     */
    public setConfig(config: Partial<GameConfig>): void {
        this._config = { ...this._config, ...config };
        this._applySettings();
    }

    /**
     * 获取配置
     */
    public getConfig(): Readonly<GameConfig> {
        return { ...this._config };
    }

    /**
     * 更新设置
     */
    public updateSettings(settings: Partial<GameSettings>): void {
        this._data.settings = { ...this._data.settings, ...settings };
        this._applySettings();
        this.saveGame();
    }

    /**
     * 获取设置
     */
    public getSettings(): Readonly<GameSettings> {
        return { ...this._data.settings };
    }

    /**
     * 获取当前状态
     */
    public get state(): GameState {
        return this._state;
    }

    /**
     * 获取当前关卡
     */
    public get currentLevel(): number {
        return this._data.currentLevel;
    }

    /**
     * 获取最大解锁关卡
     */
    public get maxUnlockedLevel(): number {
        return this._data.maxUnlockedLevel;
    }

    /**
     * 获取总星星数
     */
    public get totalStars(): number {
        return this._data.totalStars;
    }

    /**
     * 获取当前场景
     */
    public get currentScene(): string {
        return this._currentScene;
    }

    /**
     * 游戏隐藏处理
     */
    private _onGameHide(): void {
        console.log('[GameManager] 游戏进入后台');
        
        // 暂停游戏
        if (this._state === GameState.PLAYING) {
            director.pause();
            this._audioManager.pauseAll();
        }
        
        // 自动存档
        this.saveGame();
        
        this._eventBus.emit('wx:hide');
    }

    /**
     * 游戏显示处理
     */
    private _onGameShow(): void {
        console.log('[GameManager] 游戏回到前台');
        
        // 恢复游戏
        if (this._state === GameState.PLAYING) {
            director.resume();
            this._audioManager.resumeAll();
        }
        
        this._eventBus.emit('wx:show');
    }

    /**
     * 销毁
     */
    protected onDestroy(): void {
        // 保存游戏
        this.saveGame();
        
        // 移除监听
        game.off(Game.EVENT_HIDE, this._onGameHide, this);
        game.off(Game.EVENT_SHOW, this._onGameShow, this);
        
        console.log('[GameManager] 已销毁');
    }
}

/**
 * 便捷函数：获取GameManager实例
 */
export function getGameManager(): GameManager {
    return GameManager.getInstance();
}
