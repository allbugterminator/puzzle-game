/**
 * FlashlightSystem.ts
 * 手电筒/视野限制系统 - 微恐氛围核心交互组件
 *
 * 特性：
 * - 跟随玩家/鼠标移动
 * - 可调节光照范围
 * - 光照边缘柔和
 * - 全向/定向光模式
 * - 光照闪烁效果
 * - 性能优化（使用遮罩而非实时光照）
 *
 * TODO: 需要美术资源配合
 * - 光照遮罩贴图（圆形光斑）
 * - 手电筒光束贴图（锥形）
 */

import {
    _decorator,
    Component,
    Graphics,
    Mask,
    Material,
    MeshRenderer,
    Node,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    Vec2,
    Vec3,
    view,
    tween,
    Tween,
    Camera,
    director,
    warn,
    instantiate,
    Color
} from 'cc';

const { ccclass, property } = _decorator;

/** 光照模式 */
export enum LightMode {
    OMNIDIRECTIONAL = 'omni',   // 全向光（圆形）
    DIRECTIONAL = 'directional', // 定向光（手电筒）
    FIXED = 'fixed'              // 固定位置
}

/** 光照配置 */
export interface FlashlightConfig {
    mode: LightMode;
    radius: number;             // 光照半径（像素）
    angle: number;              // 光照角度（定向光）
    edgeSoftness: number;       // 边缘柔和度 (0-1)
    intensity: number;          // 光照强度 (0-1)
    color: { r: number; g: number; b: number; };
    followTarget: Node | null;  // 跟随目标
    offset: Vec3;               // 相对于目标的偏移
}

/** 光照预设 */
export const FLASHLIGHT_PRESETS = {
    /** 手持手电筒 */
    FLASHLIGHT: {
        mode: LightMode.DIRECTIONAL,
        radius: 200,
        angle: 45,
        edgeSoftness: 0.3,
        intensity: 1.0,
        color: { r: 1, g: 0.95, b: 0.8 },
        followTarget: null,
        offset: new Vec3(0, 0, 0)
    },

    /** 头顶光源 */
    HEADLAMP: {
        mode: LightMode.OMNIDIRECTIONAL,
        radius: 150,
        angle: 360,
        edgeSoftness: 0.5,
        intensity: 0.8,
        color: { r: 1, g: 1, b: 0.9 },
        followTarget: null,
        offset: new Vec3(0, 20, 0)
    },

    /** 大范围探索 */
    EXPLORATION: {
        mode: LightMode.OMNIDIRECTIONAL,
        radius: 300,
        angle: 360,
        edgeSoftness: 0.4,
        intensity: 0.6,
        color: { r: 0.9, g: 0.9, b: 1 },
        followTarget: null,
        offset: new Vec3(0, 0, 0)
    },

    /** 受限视野 */
    RESTRICTED: {
        mode: LightMode.OMNIDIRECTIONAL,
        radius: 100,
        angle: 360,
        edgeSoftness: 0.2,
        intensity: 0.7,
        color: { r: 1, g: 0.9, b: 0.9 },
        followTarget: null,
        offset: new Vec3(0, 0, 0)
    },

    /** 灯笼效果 */
    LANTERN: {
        mode: LightMode.OMNIDIRECTIONAL,
        radius: 180,
        angle: 360,
        edgeSoftness: 0.6,
        intensity: 0.9,
        color: { r: 1, g: 0.8, b: 0.6 },
        followTarget: null,
        offset: new Vec3(0, 10, 0)
    }
};

/**
 * 手电筒/视野限制系统
 */
@ccclass('FlashlightSystem')
export class FlashlightSystem extends Component {
    @property({
        type: Node,
        tooltip: '光照跟随目标（通常是玩家）'
    })
    followTarget: Node = null;              // TODO: 需要在场景中将玩家节点绑定

    @property({
        type: Sprite,
        tooltip: '光照遮罩Sprite'
    })
    lightMask: Sprite = null;               // TODO: 需要美术提供光照遮罩贴图

    @property({
        type: Graphics,
        tooltip: '用于绘制暗角的Graphics组件'
    })
    darknessGraphics: Graphics = null;

    @property({
        type: Enum(LightMode),
        tooltip: '光照模式'
    })
    lightMode: LightMode = LightMode.OMNIDIRECTIONAL;

    @property({
        range: [50, 500],
        slide: true,
        tooltip: '光照半径（像素）'
    })
    lightRadius: number = 150;

    @property({
        range: [10, 120],
        slide: true,
        tooltip: '光照角度（仅定向光）'
    })
    lightAngle: number = 45;

    @property({
        range: [0, 1],
        slide: true,
        tooltip: '边缘柔和度'
    })
    edgeSoftness: number = 0.3;

    @property({
        range: [0, 1],
        slide: true,
        tooltip: '黑暗程度'
    })
    darknessLevel: number = 0.85;

    @property(Color)
    lightColor: Color = new Color(255, 245, 230, 255);

    @property({
        tooltip: '是否跟随鼠标'
    })
    followMouse: boolean = false;

    @property({
        tooltip: '是否启用光照闪烁'
    })
    enableFlicker: boolean = false;

    @property({
        range: [0.01, 0.3],
        slide: true,
        tooltip: '闪烁强度'
    })
    flickerIntensity: number = 0.1;

    @property({
        range: [0.05, 0.5],
        slide: true,
        tooltip: '闪烁最小间隔'
    })
    flickerMinInterval: number = 0.1;

    @property({
        range: [0.1, 1],
        slide: true,
        tooltip: '闪烁最大间隔'
    })
    flickerMaxInterval: number = 0.3;

    // 运行时状态
    private _lightPosition: Vec3 = new Vec3();
    private _lightDirection: number = 0;    // 光照方向（角度）
    private _flickerTimer: number = 0;
    private _nextFlickerTime: number = 0;
    private _baseRadius: number = 150;
    private _camera: Camera | null = null;
    private _isEnabled: boolean = true;
    private _screenSize: Vec2 = new Vec2();

    onLoad() {
        this._baseRadius = this.lightRadius;
        this._screenSize = view.getVisibleSize();
        this._initSystem();
    }

    start() {
        this._camera = director.getScene()?.getComponentInChildren(Camera);
        if (!this._camera) {
            warn('[FlashlightSystem] 未找到主相机');
        }

        this._scheduleNextFlicker();
    }

    update(deltaTime: number) {
        if (!this._isEnabled) return;

        this._updateLightPosition();
        this._updateFlicker(deltaTime);
        this._renderDarkness();
    }

    /**
     * 初始化系统
     * TODO: 需要美术资源配合
     * 1. 创建全屏遮罩节点
     * 2. 使用Graphics绘制暗角
     * 3. 或使用Shader材质实现
     */
    private _initSystem(): void {
        // 初始化Graphics
        if (!this.darknessGraphics) {
            const darknessNode = new Node('DarknessMask');
            darknessNode.parent = this.node;
            darknessNode.setSiblingIndex(1000);

            const uiTransform = darknessNode.addComponent(UITransform);
            uiTransform.setContentSize(this._screenSize.x * 2, this._screenSize.y * 2);

            this.darknessGraphics = darknessNode.addComponent(Graphics);
            this.darknessGraphics.lineWidth = 0;
        }

        // 初始化光照遮罩
        if (!this.lightMask) {
            // TODO: 创建或使用美术提供的光照遮罩
        }
    }

    /**
     * 更新光照位置
     */
    private _updateLightPosition(): void {
        let targetPos: Vec3;

        if (this.followTarget) {
            // 跟随目标
            targetPos = this.followTarget.getWorldPosition();
            targetPos.add(this.lightMode === LightMode.HEADLAMP ? new Vec3(0, 20, 0) : Vec3.ZERO);
        } else if (this.followMouse) {
            // 跟随鼠标（TODO: 实现鼠标位置获取）
            targetPos = new Vec3(0, 0, 0);
        } else {
            // 使用当前设置位置
            targetPos = this._lightPosition;
        }

        this._lightPosition.set(targetPos);
    }

    /**
     * 更新闪烁效果
     */
    private _updateFlicker(deltaTime: number): void {
        if (!this.enableFlicker) return;

        this._flickerTimer += deltaTime;

        if (this._flickerTimer >= this._nextFlickerTime) {
            // 触发闪烁
            const flickerAmount = (Math.random() - 0.5) * 2 * this.flickerIntensity;
            this.lightRadius = this._baseRadius * (1 + flickerAmount);

            this._flickerTimer = 0;
            this._scheduleNextFlicker();
        }
    }

    /**
     * 安排下一次闪烁
     */
    private _scheduleNextFlicker(): void {
        this._nextFlickerTime = this.flickerMinInterval +
            Math.random() * (this.flickerMaxInterval - this.flickerMinInterval);
    }

    /**
     * 渲染黑暗遮罩
     * TODO: 性能优化 - 当前使用Graphics方式，建议美术提供Shader方案
     */
    private _renderDarkness(): void {
        if (!this.darknessGraphics) return;

        const g = this.darknessGraphics;
        g.clear();

        // 填充全屏黑色
        const screenW = this._screenSize.x * 2;
        const screenH = this._screenSize.y * 2;

        // 转换为屏幕坐标
        const screenPos = this._worldToScreen(this._lightPosition);

        // 绘制暗角遮罩
        // 方案：绘制全屏黑色，然后在光照位置绘制透明圆形
        // 注意：这种方案性能较低，建议后期替换为Shader

        g.fillColor.set(
            0, 0, 0,
            Math.floor(this.darknessLevel * 255)
        );

        // 绘制全屏暗色背景
        g.fillRect(-screenW / 2, -screenH / 2, screenW, screenH);

        // 在光照位置绘制透明圆形（挖空）
        // 注意：Graphics不支持真正的挖空，这里仅做示意
        // 实际实现应使用Canvas的globalCompositeOperation或Shader

        // TODO: 优化方案
        // 1. 使用Canvas渲染纹理
        // 2. 或使用Shader材质
        // 3. 或使用预制好的光照贴图
    }

    /**
     * 世界坐标转屏幕坐标
     */
    private _worldToScreen(worldPos: Vec3): Vec2 {
        if (!this._camera) return new Vec2(0, 0);

        const screenPos = this._camera.worldToScreen(worldPos);
        return new Vec2(screenPos.x, screenPos.y);
    }

    /**
     * 设置光照模式
     */
    public setLightMode(mode: LightMode): void {
        this.lightMode = mode;
    }

    /**
     * 设置光照半径
     */
    public setLightRadius(radius: number, duration: number = 0): void {
        radius = Math.max(50, Math.min(500, radius));
        this._baseRadius = radius;

        if (duration <= 0) {
            this.lightRadius = radius;
        } else {
            tween(this)
                .to(duration, { lightRadius: radius })
                .start();
        }
    }

    /**
     * 设置光照角度
     */
    public setLightAngle(angle: number): void {
        this.lightAngle = Math.max(10, Math.min(120, angle));
    }

    /**
     * 设置光照方向
     */
    public setLightDirection(angle: number): void {
        this._lightDirection = angle % 360;
    }

    /**
     * 设置跟随目标
     */
    public setFollowTarget(target: Node | null): void {
        this.followTarget = target;
    }

    /**
     * 设置黑暗程度
     */
    public setDarknessLevel(level: number, duration: number = 0): void {
        level = Math.max(0, Math.min(1, level));

        if (duration <= 0) {
            this.darknessLevel = level;
        } else {
            tween(this)
                .to(duration, { darknessLevel: level })
                .start();
        }
    }

    /**
     * 启用/禁用系统
     */
    public setEnabled(enabled: boolean): void {
        this._isEnabled = enabled;
        if (this.darknessGraphics) {
            this.darknessGraphics.node.active = enabled;
        }
        if (this.lightMask) {
            this.lightMask.node.active = enabled;
        }
    }

    /**
     * 是否已启用
     */
    public isEnabled(): boolean {
        return this._isEnabled;
    }

    /**
     * 启用闪烁效果
     */
    public startFlicker(): void {
        this.enableFlicker = true;
        this._scheduleNextFlicker();
    }

    /**
     * 停止闪烁效果
     */
    public stopFlicker(): void {
        this.enableFlicker = false;
        this.setLightRadius(this._baseRadius, 0.3);
    }

    /**
     * 应用预设
     */
    public applyPreset(presetName: keyof typeof FLASHLIGHT_PRESETS): void {
        const preset = FLASHLIGHT_PRESETS[presetName];
        if (!preset) {
            warn(`[FlashlightSystem] 未知预设: ${presetName}`);
            return;
        }

        this.lightMode = preset.mode;
        this.setLightRadius(preset.radius);
        this.lightAngle = preset.angle;
        this.edgeSoftness = preset.edgeSoftness;
        this.lightColor.set(
            preset.color.r * 255,
            preset.color.g * 255,
            preset.color.b * 255
        );
    }

    /**
     * 触发剧烈闪烁（惊吓效果）
     */
    public triggerIntenseFlicker(duration: number = 2): void {
        const originalIntensity = this.flickerIntensity;
        const originalMin = this.flickerMinInterval;
        const originalMax = this.flickerMaxInterval;

        // 增强闪烁
        this.flickerIntensity = 0.4;
        this.flickerMinInterval = 0.02;
        this.flickerMaxInterval = 0.1;

        // 恢复
        setTimeout(() => {
            this.flickerIntensity = originalIntensity;
            this.flickerMinInterval = originalMin;
            this.flickerMaxInterval = originalMax;
        }, duration * 1000);
    }
}
