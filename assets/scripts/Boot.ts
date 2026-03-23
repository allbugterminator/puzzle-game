/**
 * Boot.ts
 * 游戏启动入口
 *
 * 职责：
 * - 初始化所有管理器
 * - 加载必要资源
 * - 进入主菜单
 */

import { _decorator, Component, director, game, Game } from 'cc';
import { EventBus } from './core/EventBus';
import { GameManager } from './managers/GameManager';
import { AudioManager } from './managers/AudioManager';
import { UIManager } from './managers/UIManager';
import { LevelManager } from './managers/LevelManager';
import { SaveManager } from './managers/SaveManager';
import { ResLoader } from './core/ResLoader';
import { ObjectPoolManager } from './core/ObjectPool';
import { PlatformManager } from './platform/Platform';
import { WXAdapter } from './platform/WXAdapter';

const { ccclass, property } = _decorator;

@ccclass('Boot')
export class Boot extends Component {
    async onLoad() {
        console.log('[Boot] 游戏启动...');

        // 初始化平台
        await this._initPlatform();

        // 初始化核心系统
        await this._initCore();

        // 初始化管理器
        await this._initManagers();

        // 启动游戏
        await this._startGame();
    }

    /**
     * 初始化平台适配
     */
    private async _initPlatform(): Promise<void> {
        console.log('[Boot] 初始化平台适配...');

        // 检测平台类型
        let platform: WXAdapter;

        if (WXAdapter.isWechat()) {
            platform = new WXAdapter();
            console.log('[Boot] 微信平台');
        } else {
            // Web平台使用基类
            // TODO: 创建Web适配器
            platform = new WXAdapter();
            console.log('[Boot] Web平台');
        }

        await platform.init();
        PlatformManager.init(platform);
    }

    /**
     * 初始化核心系统
     */
    private async _initCore(): Promise<void> {
        console.log('[Boot] 初始化核心系统...');

        // 初始化事件总线
        EventBus.getInstance();

        // 初始化资源加载器
        ResLoader.getInstance();

        // 初始化对象池管理器
        ObjectPoolManager.getInstance();
    }

    /**
     * 初始化管理器
     */
    private async _initManagers(): Promise<void> {
        console.log('[Boot] 初始化管理器...');

        // 按依赖顺序初始化
        SaveManager.getInstance();
        AudioManager.getInstance();
        UIManager.getInstance();
        LevelManager.getInstance();

        // 最后初始化游戏管理器（依赖其他管理器）
        GameManager.getInstance();
    }

    /**
     * 启动游戏
     */
    private async _startGame(): Promise<void> {
        console.log('[Boot] 启动游戏主逻辑...');

        const gameManager = GameManager.getInstance();
        await gameManager.boot();
    }
}
