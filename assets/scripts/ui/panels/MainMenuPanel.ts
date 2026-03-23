/**
 * MainMenuPanel.ts
 * 主菜单面板
 */

import { _decorator, Button, director, Label, Node } from 'cc';
import { PanelBase } from '../components/PanelBase';
import { GameManager } from '../../managers/GameManager';

const { ccclass, property } = _decorator;

@ccclass('MainMenuPanel')
export class MainMenuPanel extends PanelBase {
    @property(Button)
    startBtn: Button = null;

    @property(Button)
    continueBtn: Button = null;

    @property(Button)
    settingsBtn: Button = null;

    @property(Button)
    aboutBtn: Button = null;

    @property(Label)
    versionLabel: Label = null;

    private _gameManager: GameManager;

    onLoad() {
        this._gameManager = GameManager.getInstance();
        this._setupButtons();
        this._updateUI();
    }

    private _setupButtons(): void {
        this.startBtn?.node.on(Button.EventType.CLICK, this._onStartGame, this);
        this.continueBtn?.node.on(Button.EventType.CLICK, this._onContinue, this);
        this.settingsBtn?.node.on(Button.EventType.CLICK, this._onSettings, this);
        this.aboutBtn?.node.on(Button.EventType.CLICK, this._onAbout, this);
    }

    private _updateUI(): void {
        // 检查是否有存档
        const hasSave = this._gameManager.maxUnlockedLevel > 1;
        if (this.continueBtn) {
            this.continueBtn.node.active = hasSave;
        }

        // 版本号
        if (this.versionLabel) {
            this.versionLabel.string = 'v1.0.0 Demo';
        }
    }

    private _onStartGame(): void {
        // 进入第一关（教学关）
        director.loadScene('Tutorial');
    }

    private _onContinue(): void {
        // 继续游戏
        this._gameManager.startGame();
    }

    private _onSettings(): void {
        // TODO: 打开设置面板
        console.log('[MainMenuPanel] 打开设置');
    }

    private _onAbout(): void {
        // TODO: 打开关于面板
        console.log('[MainMenuPanel] 打开关于');
    }
}
