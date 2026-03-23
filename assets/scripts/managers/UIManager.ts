/**
 * UIManager.ts
 * UI管理器 - 统一UI面板和组件管理
 * 
 * 特性：
 * - 面板栈管理
 * - 打开/关闭动画
 * - 模态/非模态
 * - 层级管理
 * - 缓存复用
 */

import { 
    _decorator, 
    Canvas,
    Component, 
    director, 
    instantiate, 
    Node, 
    Prefab,
    UIOpacity,
    UITransform,
    v3,
    warn,
    Widget
} from 'cc';
import { Singleton } from '../core/Singleton';
import { EventBus } from '../core/EventBus';
import { ObjectPool } from '../core/ObjectPool';

const { ccclass, property } = _decorator;

/** UI层级 */
export enum UILayer {
    BACKGROUND = -100,   // 背景层
    SCENE = 0,           // 场景层
    GAME = 100,          // 游戏层
    UI = 200,            // UI层
    POPUP = 300,         // 弹窗层
    OVERLAY = 400,       // 覆盖层
    TOP = 500,           // 最顶层
    DEBUG = 1000         // 调试层
}

/** 面板配置 */
export interface PanelConfig {
    prefab: Prefab;
    layer: UILayer;
    modal: boolean;
    cache: boolean;
    animation: 'none' | 'fade' | 'scale' | 'slide_up' | 'slide_down';
    closeOnClickOutside: boolean;
    showMask: boolean;
    maskAlpha: number;
}

/** 面板实例 */
interface PanelInstance {
    name: string;
    node: Node;
    config: PanelConfig;
    isOpen: boolean;
    opacity?: UIOpacity;
}

/**
 * UI管理器
 */
@ccclass('UIManager')
export class UIManager extends Singleton<UIManager> {
    /** UI根节点 */
    private _uiRoot: Node | null = null;

    /** 层级节点映射 */
    private _layerNodes: Map<UILayer, Node> = new Map();

    /** 面板配置映射 */
    private _panelConfigs: Map<string, PanelConfig> = new Map();

    /** 打开的面板 */
    private _openPanels: Map<string, PanelInstance> = new Map();

    /** 面板池 */
    private _panelPools: Map<string, ObjectPool<Node>> = new Map();

    /** 面板栈 */
    private _panelStack: string[] = [];

    /** 模态遮罩 */
    private _maskNode: Node | null = null;

    /** 事件总线 */
    private _eventBus: EventBus;

    /**
     * 初始化
     */
    protected onInitialize(): void {
        this._eventBus = EventBus.getInstance();
        this._initUIRoot();
        console.log('[UIManager] 初始化完成');
    }

    /**
     * 初始化UI根节点
     */
    private _initUIRoot(): void {
        const scene = director.getScene();
        if (!scene) {
            warn('[UIManager] 场景未加载，延迟初始化');
            return;
        }

        // 获取或创建Canvas
        let canvas = scene.getComponentInChildren(Canvas);
        if (!canvas) {
            warn('[UIManager] 未找到Canvas');
            return;
        }

        // 创建UI根节点
        this._uiRoot = new Node('UIRoot');
        this._uiRoot.parent = canvas.node;
        
        // 添加Widget组件
        const widget = this._uiRoot.addComponent(Widget);
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.left = 0;
        widget.right = 0;
        widget.top = 0;
        widget.bottom = 0;

        // 创建层级节点
        const layers = [
            UILayer.BACKGROUND,
            UILayer.SCENE,
            UILayer.GAME,
            UILayer.UI,
            UILayer.POPUP,
            UILayer.OVERLAY,
            UILayer.TOP
        ];

        layers.forEach(layer => {
            const layerNode = new Node(`Layer_${layer}`);
            layerNode.parent = this._uiRoot;
            layerNode.setSiblingIndex(layer + 1000);
            this._layerNodes.set(layer, layerNode);
        });

        // 创建遮罩节点
        this._createMaskNode();
    }

    /**
     * 创建遮罩节点
     */
    private _createMaskNode(): void {
        this._maskNode = new Node('UIMask');
        this._maskNode.parent = this._uiRoot;
        
        const uiTransform = this._maskNode.addComponent(UITransform);
        uiTransform.setContentSize(2000, 2000);
        
        const widget = this._maskNode.addComponent(Widget);
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.isAlignTop = true;
        widget.isAlignBottom = true;

        // TODO: 添加半透明黑色Sprite
        
        this._maskNode.active = false;
    }

    /**
     * 注册面板
     */
    public registerPanel(name: string, config: PanelConfig): void {
        this._panelConfigs.set(name, config);
        console.log(`[UIManager] 注册面板: ${name}`);
    }

    /**
     * 打开面板
     */
    public async openPanel(
        name: string, 
        data?: any, 
        onOpen?: () => void
    ): Promise<boolean> {
        if (!this._uiRoot) {
            this._initUIRoot();
        }

        // 检查是否已打开
        if (this._openPanels.has(name)) {
            warn(`[UIManager] 面板 ${name} 已打开`);
            return false;
        }

        const config = this._panelConfigs.get(name);
        if (!config) {
            warn(`[UIManager] 未注册的面板: ${name}`);
            return false;
        }

        // 获取或创建面板节点
        let node: Node;
        if (config.cache && this._panelPools.has(name)) {
            const pool = this._panelPools.get(name)!;
            node = pool.get();
        } else {
            node = instantiate(config.prefab);
        }

        // 添加到层级
        const layerNode = this._layerNodes.get(config.layer);
        if (layerNode) {
            node.parent = layerNode;
        } else {
            node.parent = this._uiRoot;
        }

        // 获取组件
        const opacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);

        // 创建面板实例
        const panel: PanelInstance = {
            name,
            node,
            config,
            isOpen: true,
            opacity
        };

        this._openPanels.set(name, panel);
        this._panelStack.push(name);

        // 显示遮罩
        if (config.modal) {
            this._showMask(config.maskAlpha);
        }

        // 初始化面板数据
        const panelComp = node.getComponent('PanelBase') as any;
        if (panelComp?.onOpen) {
            panelComp.onOpen(data);
        }

        // 播放动画
        await this._playOpenAnimation(panel);

        onOpen?.();
        this._eventBus.emit('ui:open', { panelName: name });

        return true;
    }

    /**
     * 关闭面板
     */
    public async closePanel(name: string, data?: any): Promise<boolean> {
        const panel = this._openPanels.get(name);
        if (!panel) {
            warn(`[UIManager] 面板 ${name} 未打开`);
            return false;
        }

        // 播放关闭动画
        await this._playCloseAnimation(panel);

        // 调用关闭回调
        const panelComp = panel.node.getComponent('PanelBase') as any;
        if (panelComp?.onClose) {
            panelComp.onClose(data);
        }

        // 从栈中移除
        const index = this._panelStack.indexOf(name);
        if (index !== -1) {
            this._panelStack.splice(index, 1);
        }

        // 隐藏或销毁节点
        if (panel.config.cache) {
            panel.node.active = false;
            // 回收到池
            if (!this._panelPools.has(name)) {
                this._panelPools.set(name, new ObjectPool(name, panel.config.prefab as any));
            }
            this._panelPools.get(name)!.put(panel.node);
        } else {
            panel.node.destroy();
        }

        this._openPanels.delete(name);

        // 更新遮罩
        this._updateMask();

        this._eventBus.emit('ui:close', { panelName: name });

        return true;
    }

    /**
     * 关闭所有面板
     */
    public async closeAllPanels(): Promise<void> {
        const names = Array.from(this._openPanels.keys());
        for (const name of names) {
            await this.closePanel(name);
        }
    }

    /**
     * 关闭到指定面板
     */
    public async closeToPanel(name: string): Promise<void> {
        const index = this._panelStack.indexOf(name);
        if (index === -1) return;

        for (let i = this._panelStack.length - 1; i > index; i--) {
            await this.closePanel(this._panelStack[i]);
        }
    }

    /**
     * 获取当前面板
     */
    public getCurrentPanel(): string | null {
        if (this._panelStack.length === 0) return null;
        return this._panelStack[this._panelStack.length - 1];
    }

    /**
     * 检查面板是否打开
     */
    public isPanelOpen(name: string): boolean {
        return this._openPanels.has(name);
    }

    /**
     * 获取面板节点
     */
    public getPanelNode(name: string): Node | null {
        const panel = this._openPanels.get(name);
        return panel?.node || null;
    }

    /**
     * 播放打开动画
     */
    private async _playOpenAnimation(panel: PanelInstance): Promise<void> {
        const { animation, opacity } = panel;

        if (animation === 'none' || !opacity) {
            if (opacity) opacity.opacity = 255;
            return;
        }

        return new Promise(resolve => {
            switch (animation) {
                case 'fade':
                    opacity.opacity = 0;
                    // TODO: 使用tween实现淡入
                    opacity.opacity = 255;
                    setTimeout(resolve, 200);
                    break;
                case 'scale':
                    panel.node.setScale(0.8, 0.8, 1);
                    // TODO: 使用tween实现缩放
                    panel.node.setScale(1, 1, 1);
                    setTimeout(resolve, 200);
                    break;
                default:
                    resolve();
            }
        });
    }

    /**
     * 播放关闭动画
     */
    private async _playCloseAnimation(panel: PanelInstance): Promise<void> {
        const { animation, opacity } = panel;

        if (animation === 'none' || !opacity) {
            return;
        }

        return new Promise(resolve => {
            switch (animation) {
                case 'fade':
                    // TODO: 使用tween实现淡出
                    setTimeout(resolve, 200);
                    break;
                case 'scale':
                    // TODO: 使用tween实现缩放
                    setTimeout(resolve, 200);
                    break;
                default:
                    resolve();
            }
        });
    }

    /**
     * 显示遮罩
     */
    private _showMask(alpha: number): void {
        if (this._maskNode) {
            this._maskNode.active = true;
            // TODO: 设置透明度
        }
    }

    /**
     * 隐藏遮罩
     */
    private _hideMask(): void {
        if (this._maskNode) {
            this._maskNode.active = false;
        }
    }

    /**
     * 更新遮罩状态
     */
    private _updateMask(): void {
        // 检查是否有模态面板
        let hasModal = false;
        let topAlpha = 0.6;

        for (let i = this._panelStack.length - 1; i >= 0; i--) {
            const name = this._panelStack[i];
            const panel = this._openPanels.get(name);
            if (panel?.config.modal) {
                hasModal = true;
                topAlpha = panel.config.maskAlpha;
                break;
            }
        }

        if (hasModal) {
            this._showMask(topAlpha);
        } else {
            this._hideMask();
        }
    }

    /**
     * 销毁
     */
    protected onDestroy(): void {
        this.closeAllPanels();
        this._panelPools.clear();
        this._panelConfigs.clear();
        this._layerNodes.clear();
        
        console.log('[UIManager] 已销毁');
    }
}
