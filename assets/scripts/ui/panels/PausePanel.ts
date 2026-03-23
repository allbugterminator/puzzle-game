/**
 * PausePanel.ts
 * 暂停面板
 */

import { _decorator, Button } from 'cc';
import { PanelBase } from '../components/PanelBase';
import { GameManager } from '../../managers/GameManager';

const { ccclass, property } = _decorator;

@ccclass('PausePanel')
export class PausePanel extends PanelBase {
    @property(Button)
    resumeBtn: Button = null;

    @property(Button)
    restartBtn: Button = null;

    @property(Button)
    homeBtn: Button = null;

    private _gameManager: GameManager;

    onLoad() {
        this._gameManager = GameManager.getInstance();
        this._setupButtons();
    }

    private _setupButtons(): void {
        this.resumeBtn?.node.on(Button.EventType.CLICK, this._onResume, this);
        this.restartBtn?.node.on(Button.EventType.CLICK, this._onRestart, this);
        this.homeBtn?.node.on(Button.EventType.CLICK, this._onHome, this);
    }

    private _onResume(): void {
        this._gameManager.resumeGame();
    }

    private _onRestart(): void {
        this._gameManager.restartLevel();
    }

    private _onHome(): void {
        this._gameManager.enterHome();
    }
}
