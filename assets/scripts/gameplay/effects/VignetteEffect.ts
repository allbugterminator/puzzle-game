/**
 * VignetteEffect.ts
 * 暗角效果 - 微恐氛围核心视觉组件
 *
 * 特性：
 * - 可调节暗角强度和范围
 * - 平滑过渡动画
 * - 支持呼吸效果
 * - 性能优化设计
 *
 * TODO: 需要美术资源配合
 * - 暗角遮罩贴图（可选，用于不规则暗角）
 */

import {
    _decorator,
    Component,
    Material,
    MeshRenderer,
    Node,
    Sprite,
    UITransform,
    Vec2,
    view,
    tween,
    Tween,
    warn,
    director,
    Camera
} from 'cc';

const { ccclass, property } = _decorator;

/** 暗角配置 */
export interface VignetteConfig {
    intensity: number;      // 暗角强度 (0-1)
    smoothness: number;     // 边缘柔和度 (0-2)
    center: Vec2;           // 中心点偏移 (0-1)
    color: { r: number; g: number; b: number; }; // 暗角颜色
}

/** 暗角预设 */
export const VIGNETTE_PRESETS = {
    NONE: {
        intensity: 0,
        smoothness: 1,
        center: new Vec2(0.5, 0.5),
        color: { r: 0, g: 0, b: 0 }
    },
    LIGHT: {
        intensity: 0.3,
        smoothness: 1.5,
        center: new Vec2(0.5, 0.5),
        color: { r: 0, g: 0, b: 0 }
    },
    MEDIUM: {
        intensity: 0.5,
        smoothness: 1.2,
        center: new Vec2(0.5, 0.5),
        color: { r: 0, g: 0, b: 0 }
    },
    HEAVY: {
        intensity: 0.75,
        smoothness: 0.8,
        center: new Vec2(0.5, 0.5),
        color: { r: 0, g: 0, b: 0 }
    },
    MYSTERIOUS: {
        intensity: 0.6,
        smoothness: 1.0,
        center: new Vec2(0.5, 0.5),
        color: { r: 0.1, g: 0.05, b: 0.15 } // 偏紫的暗角
    },
    TENSE: {
        intensity: 0.7,
        smoothness: 0.9,
        center: new Vec2(0.5, 0.48), // 稍微偏下，增加压抑感
        color: { r: 0.15, g: 0.05, b: 0.05 } // 偏红的暗角
    }
};

/**
 * 暗角效果控制器
 * P0优先级 - 需要优先实现
 */
@ccclass('VignetteEffect')
export class VignetteEffect extends Component {
    @property(Material)
    vignetteMaterial: Material = null;  // TODO: 需要美术/技术美术配合创建暗角材质

    @property({
        type: Sprite,
        tooltip: '暗角遮罩Sprite，覆盖全屏'
    })
    vignetteSprite: Sprite = null;      // TODO: 需要美术创建全屏遮罩Sprite

    @property({
        range: [0, 1],
        slide: true,
        tooltip: '暗角强度'
    })
    intensity: number = 0.5;

    @property({
        range: [0.1, 3],
        slide: true,
        tooltip: '边缘柔和度，越小越锐利'
    })
    smoothness: number = 1.2;

    @property({
        tooltip: '中心点X偏移'
    })
    centerX: number = 0.5;

    @property({
        tooltip: '中心点Y偏移'
    })
    centerY: number = 0.5;

    @property({
        tooltip: '是否启用呼吸效果'
    })
    enableBreathing: boolean = false;

    @property({
        range: [0.01, 0.5],
        slide: true,
        tooltip: '呼吸强度变化'
    })
    breatheIntensity: number = 0.1;

    @property({
        range: [1, 10],
        slide: true,
        tooltip: '呼吸周期（秒）'
    })
    breathePeriod: number = 4;

    // 运行时状态
    private _baseIntensity: number = 0.5;
    private _breatheTween: Tween<any> | null = null;
    private _transitionTween: Tween<any> | null = null;
    private _isEnabled: boolean = true;

    onLoad() {
        this._baseIntensity = this.intensity;
        this._initVignette();
    }

    start() {
        if (this.enableBreathing) {
            this.startBreathing();
        }
    }

    onDestroy() {
        this.stopBreathing();
        this._transitionTween?.stop();
    }

    /**
     * 初始化暗角效果
     * TODO: 需要美术资源配合
     * 1. 创建全屏Sprite覆盖在UI最上层
     * 2. 使用Shader材质实现暗角效果
     * 3. 或者使用预制好的暗角贴图
     */
    private _initVignette(): void {
        if (!this.vignetteSprite) {
            this._createDefaultVignetteSprite();
        }

        this._applySettings();
    }

    /**
     * 创建默认暗角Sprite
     * TODO: 建议美术提供专用的暗角遮罩贴图
     */
    private _createDefaultVignetteSprite(): void {
        // 创建全屏暗角节点
        const vignetteNode = new Node('VignetteOverlay');
        vignetteNode.parent = this.node;

        const uiTransform = vignetteNode.addComponent(UITransform);
        const screenSize = view.getVisibleSize();
        uiTransform.setContentSize(screenSize.width, screenSize.height);

        this.vignetteSprite = vignetteNode.addComponent(Sprite);

        // TODO: 加载美术提供的暗角贴图或使用程序化材质
        // this.vignetteSprite.spriteFrame = ...;

        // 设置层级确保在最上层
        vignetteNode.setSiblingIndex(9999);
    }

    /**
     * 应用当前设置
     */
    private _applySettings(): void {
        if (!this._isEnabled) return;

        // 通过材质参数控制暗角效果
        if (this.vignetteMaterial) {
            this.vignetteMaterial.setProperty('vignetteIntensity', this.intensity);
            this.vignetteMaterial.setProperty('vignetteSmoothness', this.smoothness);
            this.vignetteMaterial.setProperty('vignetteCenter', new Vec2(this.centerX, this.centerY));
        }

        // 通过Sprite透明度控制（备用方案）
        if (this.vignetteSprite) {
            this.vignetteSprite.color.set(
                0, 0, 0,
                Math.floor(this.intensity * 255)
            );
        }
    }

    /**
     * 设置暗角强度
     * @param value 强度值 (0-1)
     * @param duration 过渡时间（秒），0为立即生效
     */
    public setIntensity(value: number, duration: number = 0): void {
        value = Math.max(0, Math.min(1, value));
        this._baseIntensity = value;

        if (duration <= 0) {
            this.intensity = value;
            this._applySettings();
        } else {
            this._transitionTween?.stop();
            this._transitionTween = tween(this)
                .to(duration, { intensity: value }, {
                    onUpdate: () => this._applySettings()
                })
                .start();
        }
    }

    /**
     * 获取当前强度
     */
    public getIntensity(): number {
        return this.intensity;
    }

    /**
     * 设置边缘柔和度
     */
    public setSmoothness(value: number): void {
        this.smoothness = Math.max(0.1, Math.min(3, value));
        this._applySettings();
    }

    /**
     * 设置中心点偏移
     */
    public setCenter(x: number, y: number): void {
        this.centerX = Math.max(0, Math.min(1, x));
        this.centerY = Math.max(0, Math.min(1, y));
        this._applySettings();
    }

    /**
     * 应用预设
     */
    public applyPreset(presetName: keyof typeof VIGNETTE_PRESETS, duration: number = 1): void {
        const preset = VIGNETTE_PRESETS[presetName];
        if (!preset) {
            warn(`[VignetteEffect] 未知预设: ${presetName}`);
            return;
        }

        if (duration <= 0) {
            this.intensity = preset.intensity;
            this.smoothness = preset.smoothness;
            this.centerX = preset.center.x;
            this.centerY = preset.center.y;
            this._applySettings();
        } else {
            this._transitionTween?.stop();
            this._transitionTween = tween(this)
                .to(duration, {
                    intensity: preset.intensity,
                    smoothness: preset.smoothness,
                    centerX: preset.center.x,
                    centerY: preset.center.y
                }, {
                    onUpdate: () => this._applySettings()
                })
                .start();
        }
    }

    /**
     * 启用/禁用效果
     */
    public setEnabled(enabled: boolean): void {
        this._isEnabled = enabled;
        if (this.vignetteSprite) {
            this.vignetteSprite.node.active = enabled;
        }
    }

    /**
     * 是否已启用
     */
    public isEnabled(): boolean {
        return this._isEnabled;
    }

    /**
     * 开始呼吸效果
     * 营造紧张氛围
     */
    public startBreathing(): void {
        this.stopBreathing();

        const minIntensity = this._baseIntensity - this.breatheIntensity;
        const maxIntensity = this._baseIntensity + this.breatheIntensity;

        this._breatheTween = tween({ value: this.intensity })
            .to(this.breathePeriod / 2, { value: maxIntensity }, {
                onUpdate: (obj) => {
                    this.intensity = obj.value;
                    this._applySettings();
                },
                easing: 'sineInOut'
            })
            .to(this.breathePeriod / 2, { value: minIntensity }, {
                onUpdate: (obj) => {
                    this.intensity = obj.value;
                    this._applySettings();
                },
                easing: 'sineInOut'
            })
            .union()
            .repeatForever()
            .start();
    }

    /**
     * 停止呼吸效果
     */
    public stopBreathing(): void {
        if (this._breatheTween) {
            this._breatheTween.stop();
            this._breatheTween = null;
        }
        // 平滑恢复到基础强度
        this.setIntensity(this._baseIntensity, 0.5);
    }

    /**
     * 脉冲效果（惊吓效果配合）
     * @param intensity 脉冲强度
     * @param duration 持续时间
     */
    public pulse(intensity: number = 0.9, duration: number = 0.5): void {
        const originalIntensity = this._baseIntensity;

        this._transitionTween?.stop();

        // 快速增强然后恢复
        tween(this)
            .to(duration * 0.3, {
                intensity: Math.min(1, originalIntensity + intensity)
            }, {
                onUpdate: () => this._applySettings(),
                easing: 'quadOut'
            })
            .to(duration * 0.7, {
                intensity: originalIntensity
            }, {
                onUpdate: () => this._applySettings(),
                easing: 'quadIn'
            })
            .start();
    }

    /**
     * 根据游戏进度自动调整暗角
     * @param progress 游戏进度 (0-1)
     */
    public autoAdjustByProgress(progress: number): void {
        // 随着进度推进，逐渐增加暗角强度
        const targetIntensity = 0.3 + progress * 0.4;
        this.setIntensity(targetIntensity, 2);
    }

    /**
     * 根据紧张度调整暗角
     * @param tension 紧张度 (0-1)
     */
    public adjustByTension(tension: number): void {
        const targetIntensity = 0.3 + tension * 0.5;
        const targetSmoothness = 1.5 - tension * 0.6;

        this.setIntensity(targetIntensity, 0.5);
        this.setSmoothness(targetSmoothness);
    }
}
