/**
 * ColorGrading.ts
 * 色调映射/色彩分级 - 微恐氛围视觉组件
 *
 * 特性：
 * - 饱和度控制
 * - 对比度调整
 * - 色温/色调偏移
 * - 预设方案
 * - 平滑过渡
 *
 * TODO: 需要美术资源配合
 * - 色彩查找表(LUT)贴图，用于更精确的色彩调整
 */

import {
    _decorator,
    Component,
    Material,
    Color,
    Vec3,
    view,
    Sprite,
    UITransform,
    Node,
    tween,
    Tween,
    warn
} from 'cc';

const { ccclass, property } = _decorator;

/** 色彩分级配置 */
export interface ColorGradingConfig {
    saturation: number;     // 饱和度 (0-2, 1为正常)
    contrast: number;       // 对比度 (0-2, 1为正常)
    brightness: number;     // 亮度 (0-2, 1为正常)
    temperature: number;    // 色温 (-1到1, 0为正常)
    tint: number;           // 色调 (-1到1, 0为正常)
    colorFilter: Color;     // 颜色滤镜叠加
}

/** 色彩预设 */
export const COLOR_PRESETS = {
    /** 正常 */
    NORMAL: {
        saturation: 1.0,
        contrast: 1.0,
        brightness: 1.0,
        temperature: 0,
        tint: 0,
        colorFilter: new Color(255, 255, 255, 0)
    },

    /** 神秘/冷色调 - 低饱和蓝紫 */
    MYSTERIOUS: {
        saturation: 0.6,
        contrast: 1.3,
        brightness: 0.9,
        temperature: -0.3,
        tint: 0.1,
        colorFilter: new Color(180, 200, 255, 40)
    },

    /** 紧张/偏暖 */
    TENSE: {
        saturation: 0.5,
        contrast: 1.4,
        brightness: 0.85,
        temperature: 0.2,
        tint: -0.1,
        colorFilter: new Color(255, 200, 180, 50)
    },

    /** 安全/淡绿 */
    SAFE: {
        saturation: 0.8,
        contrast: 1.1,
        brightness: 1.0,
        temperature: -0.1,
        tint: 0.2,
        colorFilter: new Color(200, 255, 200, 30)
    },

    /** 危险/偏红 */
    DANGER: {
        saturation: 0.7,
        contrast: 1.5,
        brightness: 0.8,
        temperature: 0.4,
        tint: -0.2,
        colorFilter: new Color(255, 150, 150, 60)
    },

    /** 回忆/棕褐 */
    FLASHBACK: {
        saturation: 0.3,
        contrast: 1.2,
        brightness: 1.1,
        temperature: 0.1,
        tint: 0.05,
        colorFilter: new Color(255, 230, 200, 80)
    },

    /** 噩梦/高对比 */
    NIGHTMARE: {
        saturation: 0.2,
        contrast: 1.8,
        brightness: 0.7,
        temperature: -0.2,
        tint: 0.15,
        colorFilter: new Color(200, 180, 220, 70)
    }
};

/**
 * 色调映射控制器
 * P0优先级 - 冷色调/低饱和预设
 */
@ccclass('ColorGrading')
export class ColorGrading extends Component {
    @property(Material)
    gradingMaterial: Material = null;   // TODO: 需要技术美术配合创建色彩分级材质

    @property(Sprite)
    gradingSprite: Sprite = null;       // 色彩分级Sprite

    @property({
        range: [0, 2],
        slide: true,
        tooltip: '饱和度 (1为正常)'
    })
    saturation: number = 1.0;

    @property({
        range: [0, 2],
        slide: true,
        tooltip: '对比度 (1为正常)'
    })
    contrast: number = 1.0;

    @property({
        range: [0, 2],
        slide: true,
        tooltip: '亮度 (1为正常)'
    })
    brightness: number = 1.0;

    @property({
        range: [-1, 1],
        slide: true,
        tooltip: '色温 (-1=冷, 1=暖)'
    })
    temperature: number = 0;

    @property({
        range: [-1, 1],
        slide: true,
        tooltip: '色调 (-1=绿, 1=紫)'
    })
    tint: number = 0;

    @property(Color)
    colorFilter: Color = new Color(255, 255, 255, 0);

    @property({
        tooltip: '渐变时间（秒）'
    })
    transitionDuration: number = 1.0;

    // 运行时状态
    private _currentTween: Tween<any> | null = null;
    private _isEnabled: boolean = true;
    private _targetConfig: ColorGradingConfig | null = null;

    onLoad() {
        this._initColorGrading();
    }

    start() {
        this.applySettings();
    }

    /**
     * 初始化色彩分级
     * TODO: 需要美术/技术美术配合
     * 1. 创建后处理材质
     * 2. 或使用全局Sprite覆盖方案
     */
    private _initColorGrading(): void {
        if (!this.gradingSprite) {
            this._createDefaultGradingSprite();
        }
    }

    /**
     * 创建默认分级Sprite
     * TODO: 建议美术提供LUT贴图实现更精确的色彩控制
     */
    private _createDefaultGradingSprite(): void {
        const gradingNode = new Node('ColorGradingOverlay');
        gradingNode.parent = this.node;

        const uiTransform = gradingNode.addComponent(UITransform);
        const screenSize = view.getVisibleSize();
        uiTransform.setContentSize(screenSize.width, screenSize.height);

        this.gradingSprite = gradingNode.addComponent(Sprite);

        // TODO: 设置材质或滤镜
        // this.gradingSprite.material = this.gradingMaterial;

        gradingNode.setSiblingIndex(9998);
    }

    /**
     * 应用当前设置
     */
    public applySettings(): void {
        if (!this._isEnabled) return;

        // 通过材质参数控制
        if (this.gradingMaterial) {
            this.gradingMaterial.setProperty('saturation', this.saturation);
            this.gradingMaterial.setProperty('contrast', this.contrast);
            this.gradingMaterial.setProperty('brightness', this.brightness);
            this.gradingMaterial.setProperty('temperature', this.temperature);
            this.gradingMaterial.setProperty('tint', this.tint);
            this.gradingMaterial.setProperty('colorFilter', this.colorFilter);
        }

        // 通过Sprite颜色叠加（简化方案）
        if (this.gradingSprite) {
            // 根据参数调整Sprite颜色和透明度
            this._updateSpriteBySettings();
        }
    }

    /**
     * 根据设置更新Sprite（简化方案）
     * TODO: 实际项目中建议使用Shader材质
     */
    private _updateSpriteBySettings(): void {
        if (!this.gradingSprite) return;

        // 根据饱和度、对比度计算叠加色
        const satFactor = (1 - this.saturation) * 0.5;
        const conFactor = (this.contrast - 1) * 0.3;

        // 色温影响
        const warmR = Math.max(0, this.temperature) * 50;
        const coolB = Math.max(0, -this.temperature) * 50;

        // 色调影响
        const tintG = Math.max(0, -this.tint) * 30;
        const tintM = Math.max(0, this.tint) * 30;

        const r = Math.min(255, 128 + satFactor * 50 + warmR + tintM);
        const g = Math.min(255, 128 + satFactor * 50 + tintG);
        const b = Math.min(255, 128 + satFactor * 50 + coolB + tintM);

        const alpha = Math.min(255, (satFactor + conFactor) * 100 + this.colorFilter.a);

        this.gradingSprite.color.set(r, g, b, alpha);
    }

    /**
     * 设置饱和度
     */
    public setSaturation(value: number, duration: number = 0): void {
        this._animateProperty('saturation', Math.max(0, Math.min(2, value)), duration);
    }

    /**
     * 设置对比度
     */
    public setContrast(value: number, duration: number = 0): void {
        this._animateProperty('contrast', Math.max(0, Math.min(2, value)), duration);
    }

    /**
     * 设置亮度
     */
    public setBrightness(value: number, duration: number = 0): void {
        this._animateProperty('brightness', Math.max(0, Math.min(2, value)), duration);
    }

    /**
     * 设置色温
     */
    public setTemperature(value: number, duration: number = 0): void {
        this._animateProperty('temperature', Math.max(-1, Math.min(1, value)), duration);
    }

    /**
     * 设置色调
     */
    public setTint(value: number, duration: number = 0): void {
        this._animateProperty('tint', Math.max(-1, Math.min(1, value)), duration);
    }

    /**
     * 设置颜色滤镜
     */
    public setColorFilter(color: Color, duration: number = 0): void {
        if (duration <= 0) {
            this.colorFilter.set(color);
            this.applySettings();
        } else {
            // 颜色过渡
            const startColor = this.colorFilter.clone();
            this._currentTween?.stop();
            this._currentTween = tween({ t: 0 })
                .to(duration, { t: 1 }, {
                    onUpdate: (obj) => {
                        this.colorFilter.set(
                            startColor.r + (color.r - startColor.r) * obj.t,
                            startColor.g + (color.g - startColor.g) * obj.t,
                            startColor.b + (color.b - startColor.b) * obj.t,
                            startColor.a + (color.a - startColor.a) * obj.t
                        );
                        this.applySettings();
                    }
                })
                .start();
        }
    }

    /**
     * 属性动画
     */
    private _animateProperty(property: string, targetValue: number, duration: number): void {
        if (duration <= 0) {
            (this as any)[property] = targetValue;
            this.applySettings();
            return;
        }

        const startValue = (this as any)[property];

        this._currentTween?.stop();
        this._currentTween = tween({ value: startValue })
            .to(duration, { value: targetValue }, {
                onUpdate: (obj) => {
                    (this as any)[property] = obj.value;
                    this.applySettings();
                }
            })
            .start();
    }

    /**
     * 应用预设
     */
    public applyPreset(
        presetName: keyof typeof COLOR_PRESETS,
        duration: number = -1
    ): void {
        const preset = COLOR_PRESETS[presetName];
        if (!preset) {
            warn(`[ColorGrading] 未知预设: ${presetName}`);
            return;
        }

        const transDuration = duration >= 0 ? duration : this.transitionDuration;

        this._targetConfig = { ...preset };

        if (transDuration <= 0) {
            this._applyConfig(preset);
        } else {
            this._transitionToConfig(preset, transDuration);
        }
    }

    /**
     * 直接应用配置
     */
    private _applyConfig(config: ColorGradingConfig): void {
        this.saturation = config.saturation;
        this.contrast = config.contrast;
        this.brightness = config.brightness;
        this.temperature = config.temperature;
        this.tint = config.tint;
        this.colorFilter.set(config.colorFilter);
        this.applySettings();
    }

    /**
     * 平滑过渡到配置
     */
    private _transitionToConfig(config: ColorGradingConfig, duration: number): void {
        const startSat = this.saturation;
        const startCon = this.contrast;
        const startBri = this.brightness;
        const startTemp = this.temperature;
        const startTint = this.tint;
        const startFilter = this.colorFilter.clone();

        this._currentTween?.stop();
        this._currentTween = tween({ t: 0 })
            .to(duration, { t: 1 }, {
                onUpdate: (obj) => {
                    this.saturation = startSat + (config.saturation - startSat) * obj.t;
                    this.contrast = startCon + (config.contrast - startCon) * obj.t;
                    this.brightness = startBri + (config.brightness - startBri) * obj.t;
                    this.temperature = startTemp + (config.temperature - startTemp) * obj.t;
                    this.tint = startTint + (config.tint - startTint) * obj.t;

                    this.colorFilter.set(
                        startFilter.r + (config.colorFilter.r - startFilter.r) * obj.t,
                        startFilter.g + (config.colorFilter.g - startFilter.g) * obj.t,
                        startFilter.b + (config.colorFilter.b - startFilter.b) * obj.t,
                        startFilter.a + (config.colorFilter.a - startFilter.a) * obj.t
                    );

                    this.applySettings();
                }
            })
            .start();
    }

    /**
     * 启用/禁用效果
     */
    public setEnabled(enabled: boolean): void {
        this._isEnabled = enabled;
        if (this.gradingSprite) {
            this.gradingSprite.node.active = enabled;
        }
    }

    /**
     * 是否已启用
     */
    public isEnabled(): boolean {
        return this._isEnabled;
    }

    /**
     * 根据游戏状态自动调整
     * @param state 游戏状态标识
     */
    public autoAdjustByState(state: 'exploring' | 'puzzling' | 'danger' | 'safe'): void {
        switch (state) {
            case 'exploring':
                this.applyPreset('MYSTERIOUS', 1.5);
                break;
            case 'puzzling':
                this.applyPreset('TENSE', 0.8);
                break;
            case 'danger':
                this.applyPreset('DANGER', 0.5);
                break;
            case 'safe':
                this.applyPreset('SAFE', 1.0);
                break;
        }
    }

    /**
     * 获取当前配置
     */
    public getCurrentConfig(): ColorGradingConfig {
        return {
            saturation: this.saturation,
            contrast: this.contrast,
            brightness: this.brightness,
            temperature: this.temperature,
            tint: this.tint,
            colorFilter: this.colorFilter.clone()
        };
    }
}
