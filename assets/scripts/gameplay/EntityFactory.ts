/**
 * EntityFactory.ts
 * 实体工厂 - 创建和管理游戏实体
 *
 * TODO: 美术资源配合
 * - 主角剪影精灵图（4帧待机动画）
 * - 方块纹理（可推块、墙体、规则文字块）
 * - 目标点纹理
 * - 出口纹理
 */

import {
    _decorator,
    Component,
    Node,
    Sprite,
    SpriteFrame,
    Color,
    UITransform,
    Label,
    Size,
    Vec3,
    Graphics,
    Animation,
    AnimationClip,
    warn,
    instantiate,
    Prefab,
    resources
} from 'cc';
import { EntityData } from '../managers/LevelManager';

const { ccclass, property } = _decorator;

/** 实体类型 */
export enum EntityType {
    PLAYER = 'player',
    PUSH_BLOCK = 'push_block',
    BLOCK = 'block',
    GOAL = 'goal',
    TARGET = 'target',
    OBSTACLE = 'obstacle',
    RULE_TEXT = 'rule_text'
}

/**
 * 实体工厂
 */
@ccclass('EntityFactory')
export class EntityFactory extends Component {
    @property(Prefab)
    entityPrefab: Prefab = null;

    // 颜色配置
    private readonly COLORS = {
        player: new Color(200, 200, 208, 255),      // #C8C8D0 浅灰主角
        pushBlock: new Color(100, 100, 120, 255),   // 可推块
        block: new Color(80, 80, 100, 255),         // 普通方块
        obstacle: new Color(40, 40, 60, 255),       // 墙体
        goal: new Color(233, 69, 96, 200),          // #E94560 暗红出口
        target: new Color(150, 150, 170, 150),      // 目标点
        ruleText: new Color(180, 180, 200, 255),    // 规则文字背景
        ruleTextActive: new Color(233, 69, 96, 255) // 激活的规则文字
    };

    private _entities: Map<string, Node> = new Map();
    private _entityPool: Node[] = [];

    /**
     * 创建实体
     */
    public createEntity(data: EntityData, cellSize: number): Node {
        let entity: Node;

        // 尝试从对象池获取
        if (this._entityPool.length > 0) {
            entity = this._entityPool.pop()!;
        } else {
            entity = new Node(data.id);
        }

        entity.name = data.id;

        // 添加UI变换
        let uiTransform = entity.getComponent(UITransform);
        if (!uiTransform) {
            uiTransform = entity.addComponent(UITransform);
        }

        // 根据类型设置大小和外观
        switch (data.type) {
            case EntityType.PLAYER:
                this._setupPlayer(entity, uiTransform, cellSize);
                break;
            case EntityType.PUSH_BLOCK:
            case EntityType.BLOCK:
                this._setupBlock(entity, uiTransform, cellSize, data.type);
                break;
            case EntityType.OBSTACLE:
                this._setupObstacle(entity, uiTransform, cellSize);
                break;
            case EntityType.GOAL:
                this._setupGoal(entity, uiTransform, cellSize);
                break;
            case EntityType.TARGET:
                this._setupTarget(entity, uiTransform, cellSize);
                break;
            case EntityType.RULE_TEXT:
                this._setupRuleText(entity, uiTransform, cellSize, data.properties?.text || '');
                break;
            default:
                this._setupDefault(entity, uiTransform, cellSize);
        }

        // 添加实体标识组件
        const entityComp = entity.addComponent(EntityComponent);
        entityComp.init(data);

        this._entities.set(data.id, entity);

        return entity;
    }

    /**
     * 设置玩家
     */
    private _setupPlayer(node: Node, uiTransform: UITransform, cellSize: number): void {
        // 玩家尺寸：32×64像素，但在网格中显示
        const scale = 0.5;
        uiTransform.setContentSize(cellSize * scale, cellSize);

        // 添加Sprite
        let sprite = node.getComponent(Sprite);
        if (!sprite) {
            sprite = node.addComponent(Sprite);
        }

        // TODO: 使用美术提供的主角剪影精灵图
        // 临时：使用纯色块
        sprite.color = this.COLORS.player;

        // 添加Graphics绘制剪影形状
        const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = this.COLORS.player;

        // 绘制简单的剪影形状（人形）
        const w = cellSize * scale;
        const h = cellSize;

        // 头部
        graphics.circle(0, h * 0.25, w * 0.3);
        graphics.fill();

        // 身体
        graphics.fillRect(-w * 0.25, -h * 0.3, w * 0.5, h * 0.5);

        // TODO: 添加待机动画
        // const animation = node.getComponent(Animation) || node.addComponent(Animation);
    }

    /**
     * 设置可推方块
     */
    private _setupBlock(node: Node, uiTransform: UITransform, cellSize: number, type: string): void {
        const isPushable = type === EntityType.PUSH_BLOCK;
        const size = cellSize * 0.9;
        uiTransform.setContentSize(size, size);

        const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
        graphics.clear();

        // 主体
        graphics.fillColor = isPushable ? this.COLORS.pushBlock : this.COLORS.block;
        graphics.fillRect(-size / 2, -size / 2, size, size);

        // 边框
        graphics.strokeColor = new Color(120, 120, 140, 255);
        graphics.lineWidth = 2;
        graphics.strokeRect(-size / 2, -size / 2, size, size);

        // 可推块标记
        if (isPushable) {
            graphics.fillColor = new Color(150, 150, 170, 200);
            const markSize = size * 0.2;
            graphics.fillRect(-markSize / 2, -markSize / 2, markSize, markSize);
        }
    }

    /**
     * 设置障碍物（墙体）
     */
    private _setupObstacle(node: Node, uiTransform: UITransform, cellSize: number): void {
        const size = cellSize;
        uiTransform.setContentSize(size, size);

        const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
        graphics.clear();

        // 墙体颜色
        graphics.fillColor = this.COLORS.obstacle;
        graphics.fillRect(-size / 2, -size / 2, size, size);

        // 墙体纹理（砖块效果）
        graphics.strokeColor = new Color(30, 30, 50, 255);
        graphics.lineWidth = 1;

        // 绘制砖缝
        const brickSize = size / 3;
        for (let i = 0; i < 3; i++) {
            graphics.moveTo(-size / 2, -size / 2 + i * brickSize);
            graphics.lineTo(size / 2, -size / 2 + i * brickSize);
        }
        graphics.stroke();
    }

    /**
     * 设置目标出口
     */
    private _setupGoal(node: Node, uiTransform: UITransform, cellSize: number): void {
        const size = cellSize * 0.8;
        uiTransform.setContentSize(size, size);

        const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
        graphics.clear();

        // 出口：暗红色发光效果
        graphics.fillColor = this.COLORS.goal;

        // 绘制圆形光晕效果
        graphics.circle(0, 0, size / 2);
        graphics.fill();

        // 内圈
        graphics.fillColor = new Color(255, 100, 120, 180);
        graphics.circle(0, 0, size / 3);
        graphics.fill();

        // 中心点
        graphics.fillColor = new Color(255, 150, 150, 255);
        graphics.circle(0, 0, size / 6);
        graphics.fill();
    }

    /**
     * 设置目标点
     */
    private _setupTarget(node: Node, uiTransform: UITransform, cellSize: number): void {
        const size = cellSize * 0.6;
        uiTransform.setContentSize(size, size);

        const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
        graphics.clear();

        // 目标点：虚线框
        graphics.strokeColor = this.COLORS.target;
        graphics.lineWidth = 3;

        // 绘制虚线框
        const dashSize = size / 4;
        const offset = size / 2;

        // 四角标记
        const cornerSize = size * 0.2;
        graphics.moveTo(-offset, -offset + cornerSize);
        graphics.lineTo(-offset, -offset);
        graphics.lineTo(-offset + cornerSize, -offset);

        graphics.moveTo(offset, -offset + cornerSize);
        graphics.lineTo(offset, -offset);
        graphics.lineTo(offset - cornerSize, -offset);

        graphics.moveTo(-offset, offset - cornerSize);
        graphics.lineTo(-offset, offset);
        graphics.lineTo(-offset + cornerSize, offset);

        graphics.moveTo(offset, offset - cornerSize);
        graphics.lineTo(offset, offset);
        graphics.lineTo(offset - cornerSize, offset);

        graphics.stroke();
    }

    /**
     * 设置规则文字
     */
    private _setupRuleText(node: Node, uiTransform: UITransform, cellSize: number, text: string): void {
        const size = cellSize * 0.85;
        uiTransform.setContentSize(size, size);

        const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
        graphics.clear();

        // 文字块背景
        graphics.fillColor = this.COLORS.ruleText;
        graphics.fillRect(-size / 2, -size / 2, size, size);

        // 边框
        graphics.strokeColor = new Color(150, 150, 170, 255);
        graphics.lineWidth = 2;
        graphics.strokeRect(-size / 2, -size / 2, size, size);

        // 添加文字标签
        let label = node.getComponent(Label);
        if (!label) {
            label = node.addComponent(Label);
        }
        label.string = text;
        label.fontSize = cellSize * 0.35;
        label.color = new Color(40, 40, 60, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
    }

    /**
     * 设置默认实体
     */
    private _setupDefault(node: Node, uiTransform: UITransform, cellSize: number): void {
        uiTransform.setContentSize(cellSize * 0.8, cellSize * 0.8);

        const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = Color.GRAY;
        graphics.fillRect(-cellSize * 0.4, -cellSize * 0.4, cellSize * 0.8, cellSize * 0.8);
    }

    /**
     * 获取实体
     */
    public getEntity(id: string): Node | null {
        return this._entities.get(id) || null;
    }

    /**
     * 移除实体
     */
    public removeEntity(id: string): void {
        const entity = this._entities.get(id);
        if (entity) {
            entity.removeFromParent();
            // 回收到对象池
            entity.active = false;
            this._entityPool.push(entity);
            this._entities.delete(id);
        }
    }

    /**
     * 清空所有实体
     */
    public clear(): void {
        this._entities.forEach((entity, id) => {
            entity.removeFromParent();
            entity.active = false;
            this._entityPool.push(entity);
        });
        this._entities.clear();
    }
}

/**
 * 实体组件
 */
@ccclass('EntityComponent')
export class EntityComponent extends Component {
    private _data: EntityData | null = null;
    private _gridPosition: { x: number; y: number } = { x: 0, y: 0 };

    public init(data: EntityData): void {
        this._data = data;
        this._gridPosition = { ...data.position };
    }

    public get data(): EntityData | null {
        return this._data;
    }

    public get gridPosition(): { x: number; y: number } {
        return { ...this._gridPosition };
    }

    public setGridPosition(x: number, y: number): void {
        this._gridPosition.x = x;
        this._gridPosition.y = y;
    }
}
