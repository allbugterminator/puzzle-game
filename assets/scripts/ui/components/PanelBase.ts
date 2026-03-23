/**
 * PanelBase.ts
 * UI面板基类
 */

import { _decorator, Component } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 面板基类
 */
@ccclass('PanelBase')
export class PanelBase extends Component {
    protected panelName: string = '';
    protected isModal: boolean = false;

    /**
     * 面板打开时调用
     */
    public onOpen(data?: any): void {
        this.panelName = this.node.name;
        console.log(`[PanelBase] 打开面板: ${this.panelName}`);
    }

    /**
     * 面板关闭时调用
     */
    public onClose(data?: any): void {
        console.log(`[PanelBase] 关闭面板: ${this.panelName}`);
    }

    /**
     * 关闭面板
     */
    protected close(): void {
        // 由UIManager处理关闭逻辑
    }
}
