import { _decorator, Component, Node, Prefab, instantiate, Sprite, Color, Label, Vec3, UIOpacity, Animation, AnimationClip, Tween, tween, SpriteFrame, Texture2D, Rect } from 'cc';
import { EntityType, Position, EntityProperties, RuleText } from './EntityTypes';

const { ccclass, property } = _decorator;

/**
 * 实体工厂
 * 负责创建玩家、方块、目标点、规则文字等游戏实体
 */
@ccclass('EntityFactory')
export class EntityFactory extends Component {
    // 颜色配置（基于美术资源规划）
    private readonly COLORS = {
        player: new Color(200, 200, 208, 255),    // #C8C8D0 浅灰剪影
        block: new Color(139, 69, 19, 255),       // #8B4513 棕色
        wall: new Color(74, 74, 74, 255),         // #4A4A4A 深灰
        goal: new Color(79, 189, 186, 255),       // #4FBDBA 青绿
        ruleText: new Color(233, 69, 96, 255),    // #E94560 暗红边框
        ruleTextBg: new Color(22, 33, 62, 255)    // #16213E 背景
    };

    @property({ type: Node })
    entityContainer: Node | null = null;

    @property
    cellSize: number = 64;

    // 预制体缓存
    private prefabCache: Map<string, Prefab> = new Map();
    private entityPool: Map<string, Node[]> = new Map();

    onLoad(): void {
        this.initPools();
    }

    /**
     * 初始化对象池
     */
    private initPools(): void {
        Object.values(EntityType).forEach((type) => {
            this.entityPool.set(type, []);
        });
    }

    /**
     * 创建实体
     * @param type 实体类型
     * @param id 实体ID
     * @param gridPos 网格位置
     * @param properties 属性
     * @returns 实体节点
     */
    createEntity(
        type: EntityType,
        id: string,
        gridPos: Position,
        properties: EntityProperties = {}
    ): Node {
        let entity: Node;

        switch (type) {
            case EntityType.PLAYER:
                entity = this.createPlayer(id, properties);
                break;
            case EntityType.BLOCK:
                entity = this.createBlock(id, properties);
                break;
            case EntityType.WALL:
                entity = this.createWall(id, properties);
                break;
            case EntityType.GOAL:
                entity = this.createGoal(id, properties);
                break;
            case EntityType.RULE_TEXT:
                entity = this.createRuleText(id, properties.text || '', properties);
                break;
            default:
                entity = new Node(`entity_${id}`);
                break;
        }

        // 设置位置
        entity.setPosition(this.gridToWorld(gridPos));
        
        // 添加到容器
        if (this.entityContainer) {
            entity.parent = this.entityContainer;
        }

        return entity;
    }

    /**
     * 创建玩家实体
     * @param id 玩家ID
     * @param properties 属性
     * @returns 玩家节点
     */
    private createPlayer(id: string, properties: EntityProperties): Node {
        const player = new Node(`player_${id}`);
        player.layer = 1 << 0; // UI层

        // 添加Sprite组件
        const sprite = player.addComponent(Sprite);
        sprite.color = this.COLORS.player;
        
        // 创建玩家矩形（32x64像素）
        const width = 32;
        const height = 64;
        this.createRectSpriteFrame(sprite, width, height);

        // 添加呼吸动画
        this.addBreathingAnimation(player);

        // 添加UIOpacity用于控制透明度
        player.addComponent(UIOpacity);

        return player;
    }

    /**
     * 创建可推动方块
     * @param id 方块ID
     * @param properties 属性
     * @returns 方块节点
     */
    private createBlock(id: string, properties: EntityProperties): Node {
        const block = new Node(`block_${id}`);
        block.layer = 1 << 0;

        const sprite = block.addComponent(Sprite);
        sprite.color = this.COLORS.block;
        
        // 64x64像素方块
        this.createRectSpriteFrame(sprite, 64, 64);

        // 添加边框效果
        this.addBorderEffect(block, new Color(100, 50, 10, 255));

        block.addComponent(UIOpacity);

        return block;
    }

    /**
     * 创建墙体
     * @param id 墙体ID
     * @param properties 属性
     * @returns 墙体节点
     */
    private createWall(id: string, properties: EntityProperties): Node {
        const wall = new Node(`wall_${id}`);
        wall.layer = 1 << 0;

        const sprite = wall.addComponent(Sprite);
        sprite.color = this.COLORS.wall;
        
        // 64x64像素墙体
        this.createRectSpriteFrame(sprite, 64, 64);

        // 添加纹理细节（简单的渐变效果）
        this.addTextureDetail(wall);

        wall.addComponent(UIOpacity);

        return wall;
    }

    /**
     * 创建目标点
     * @param id 目标点ID
     * @param properties 属性
     * @returns 目标点节点
     */
    private createGoal(id: string, properties: EntityProperties): Node {
        const goal = new Node(`goal_${id}`);
        goal.layer = 1 << 0;

        const sprite = goal.addComponent(Sprite);
        sprite.color = this.COLORS.goal;
        
        // 64x64像素圆形（使用方形模拟，后续可替换为圆形sprite）
        this.createRectSpriteFrame(sprite, 64, 64);

        // 添加脉冲发光动画
        this.addPulseAnimation(goal);

        goal.addComponent(UIOpacity);

        return goal;
    }

    /**
     * 创建规则文字块
     * @param id 文字块ID
     * @param text 文字内容
     * @param properties 属性
     * @returns 规则文字节点
     */
    private createRuleText(id: string, text: string, properties: EntityProperties): Node {
        const ruleText = new Node(`rule_text_${id}`);
        ruleText.layer = 1 << 0;

        // 背景
        const bgSprite = ruleText.addComponent(Sprite);
        bgSprite.color = this.COLORS.ruleTextBg;
        this.createRectSpriteFrame(bgSprite, 64, 64);

        // 边框效果
        this.addBorderEffect(ruleText, this.COLORS.ruleText, 4);

        // 文字标签
        const labelNode = new Node('label');
        labelNode.parent = ruleText;
        
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = 20;
        label.color = Color.WHITE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        // 添加发光效果
        this.addGlowEffect(ruleText);

        ruleText.addComponent(UIOpacity);

        return ruleText;
    }

    /**
     * 创建矩形SpriteFrame（程序化生成）
     * @param sprite Sprite组件
     * @param width 宽度
     * @param height 高度
     */
    private createRectSpriteFrame(sprite: Sprite, width: number, height: number): void {
        // 创建1x1像素的白色纹理，通过scale调整大小
        const texture = new Texture2D();
        texture.reset({
            width: 1,
            height: 1,
            format: Texture2D.PixelFormat.RGBA8888
        });
        
        // 填充白色像素
        const pixelData = new Uint8Array([255, 255, 255, 255]);
        texture.uploadData(pixelData);

        const spriteFrame = new SpriteFrame();
        spriteFrame.texture = texture;
        spriteFrame.rect = new Rect(0, 0, 1, 1);
        
        sprite.spriteFrame = spriteFrame;
        
        // 设置节点大小
        sprite.node.getComponent(UITransform)?.setContentSize(width, height);
    }

    /**
     * 添加呼吸动画
     * @param node 目标节点
     */
    private addBreathingAnimation(node: Node): void {
        const uiTransform = node.getComponent(UITransform);
        if (!uiTransform) return;

        const baseScale = 1;
        const breatheScale = 1.05;
        const duration = 1.5;

        // 使用Tween创建呼吸效果
        tween(node)
            .to(duration / 2, { scale: new Vec3(breatheScale, breatheScale, 1) }, { easing: 'sineInOut' })
            .to(duration / 2, { scale: new Vec3(baseScale, baseScale, 1) }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    /**
     * 添加脉冲动画
     * @param node 目标节点
     */
    private addPulseAnimation(node: Node): void {
        const sprite = node.getComponent(Sprite);
        if (!sprite) return;

        const baseColor = this.COLORS.goal.clone();
        const brightColor = new Color(
            Math.min(255, baseColor.r + 50),
            Math.min(255, baseColor.g + 50),
            Math.min(255, baseColor.b + 50),
            baseColor.a
        );

        const duration = 1;

        tween(sprite.color)
            .to(duration / 2, brightColor, { 
                easing: 'sineInOut',
                onUpdate: (target) => {
                    sprite.color = target;
                }
            })
            .to(duration / 2, baseColor, { 
                easing: 'sineInOut',
                onUpdate: (target) => {
                    sprite.color = target;
                }
            })
            .union()
            .repeatForever()
            .start();
    }

    /**
     * 添加边框效果
     * @param node 目标节点
     * @param borderColor 边框颜色
     * @param borderWidth 边框宽度
     */
    private addBorderEffect(node: Node, borderColor: Color, borderWidth: number = 2): void {
        // 创建边框节点
        const borderNode = new Node('border');
        borderNode.parent = node;
        borderNode.setSiblingIndex(0); // 放到最底层

        const sprite = borderNode.addComponent(Sprite);
        sprite.color = borderColor;
        
        const uiTransform = node.getComponent(UITransform);
        if (uiTransform) {
            const size = uiTransform.contentSize;
            this.createRectSpriteFrame(sprite, size.width + borderWidth * 2, size.height + borderWidth * 2);
        }
    }

    /**
     * 添加纹理细节（墙体用）
     * @param node 目标节点
     */
    private addTextureDetail(node: Node): void {
        // 添加一些装饰性细节，如轻微的变暗条纹
        const detailNode = new Node('detail');
        detailNode.parent = node;

        const sprite = detailNode.addComponent(Sprite);
        sprite.color = new Color(0, 0, 0, 30); // 半透明黑色
        this.createRectSpriteFrame(sprite, 64, 4);
        
        detailNode.setPosition(0, 10, 0);
    }

    /**
     * 添加发光效果
     * @param node 目标节点
     */
    private addGlowEffect(node: Node): void {
        // 创建发光层
        const glowNode = new Node('glow');
        glowNode.parent = node;
        glowNode.setSiblingIndex(0);

        const sprite = glowNode.addComponent(Sprite);
        sprite.color = new Color(233, 69, 96, 100); // 半透明规则文字色
        this.createRectSpriteFrame(sprite, 68, 68);

        // 添加缩放动画
        tween(glowNode)
            .to(1, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'sineInOut' })
            .to(1, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    /**
     * 网格坐标转换为世界坐标
     */
    private gridToWorld(gridPos: Position): Vec3 {
        const totalWidth = 8 * this.cellSize; // 默认8x8，实际需要外部传入
        const totalHeight = 8 * this.cellSize;
        const offsetX = -totalWidth / 2;
        const offsetY = -totalHeight / 2;

        return new Vec3(
            offsetX + gridPos.x * this.cellSize + this.cellSize / 2,
            offsetY + gridPos.y * this.cellSize + this.cellSize / 2,
            0
        );
    }

    /**
     * 创建多个墙体
     * @param wallPositions 墙体位置数组
     * @returns 墙体节点数组
     */
    createWalls(wallPositions: Position[]): Node[] {
        const walls: Node[] = [];
        wallPositions.forEach((pos, index) => {
            const wall = this.createEntity(EntityType.WALL, `wall_${index}`, pos);
            walls.push(wall);
        });
        return walls;
    }

    /**
     * 销毁实体
     * @param entity 实体节点
     */
    destroyEntity(entity: Node): void {
        if (entity && entity.isValid) {
            entity.destroy();
        }
    }

    /**
     * 清空所有实体
     */
    clearAllEntities(): void {
        if (this.entityContainer) {
            this.entityContainer.children.forEach((child) => {
                child.destroy();
            });
        }
    }
}
