/**
 * GameController.ts
 * 游戏控制器 - 关卡逻辑控制核心
 *
 * 职责：
 * - 加载关卡
 * - 处理输入
 * - 检测胜利
 * - 关卡切换
 */

import { _decorator, Component, Node, director, Label, input, Input, EventKeyboard, KeyCode, Camera } from 'cc';
import { GridSystem } from '../GridSystem';
import { PlayerController, MoveDirection } from '../PlayerController';
import { EntityFactory } from '../entities/EntityFactory';
import { RuleSystem } from '../RuleSystem';
import { LevelData, Position, EntityType, EntityData, TextBlockData } from '../entities/EntityTypes';
import { ResLoader } from '../../core/ResLoader';
import { VignetteEffect } from '../effects/VignetteEffect';

const { ccclass, property } = _decorator;

/** 游戏内状态 */
export enum InGameState {
    LOADING = 'loading',
    IDLE = 'idle',
    MOVING = 'moving',
    ANIMATING = 'animating',
    PAUSED = 'paused',
    VICTORY = 'victory',
    ENDING = 'ending'
}

/**
 * 游戏控制器
 * 负责加载关卡、处理输入、检测胜利、关卡切换
 */
@ccclass('GameController')
export class GameController extends Component {
    @property({ type: GridSystem })
    gridSystem: GridSystem | null = null;

    @property({ type: PlayerController })
    playerController: PlayerController | null = null;

    @property({ type: EntityFactory })
    entityFactory: EntityFactory | null = null;

    @property({ type: RuleSystem })
    ruleSystem: RuleSystem | null = null;

    @property({ type: Node })
    entityContainer: Node | null = null;

    @property({ type: Label })
    levelNameLabel: Label | null = null;

    @property({ type: Label })
    moveCountLabel: Label | null = null;

    @property({ type: Camera })
    mainCamera: Camera | null = null;

    @property({ type: VignetteEffect })
    vignetteEffect: VignetteEffect | null = null;

    // 当前关卡ID
    private currentLevelId: string = '1-1';
    
    // 当前关卡数据
    private currentLevelData: LevelData | null = null;
    
    // 游戏状态
    private gameState: InGameState = InGameState.IDLE;
    
    // 移动步数
    private moveCount: number = 0;
    
    // 实体映射
    private levelEntities: Map<string, Node> = new Map();
    private textBlockEntities: Map<string, Node> = new Map();
    
    // 关卡列表
    private readonly LEVEL_IDS = ['1-1', '1-2', '1-3', '1-4', '1-5'];

    onLoad(): void {
        this.setupInputHandlers();
    }

    start(): void {
        // 加载第一关
        this.loadLevel(this.currentLevelId);
    }

    onDestroy(): void {
        this.removeInputHandlers();
    }

    /**
     * 设置输入处理器
     */
    private setupInputHandlers(): void {
        // 键盘快捷键（测试用）
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    /**
     * 移除输入处理器
     */
    private removeInputHandlers(): void {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    /**
     * 键盘输入处理
     */
    private onKeyDown(event: EventKeyboard): void {
        switch (event.keyCode) {
            // 关卡切换
            case KeyCode.DIGIT_1:
                this.loadLevel('1-1');
                break;
            case KeyCode.DIGIT_2:
                this.loadLevel('1-2');
                break;
            case KeyCode.DIGIT_3:
                this.loadLevel('1-3');
                break;
            case KeyCode.DIGIT_4:
                this.loadLevel('1-4');
                break;
            case KeyCode.DIGIT_5:
                this.loadLevel('1-5');
                break;
            
            // 重置当前关卡
            case KeyCode.KEY_R:
                this.resetCurrentLevel();
                break;
            
            // 下一关
            case KeyCode.KEY_N:
                this.loadNextLevel();
                break;
            
            // 上一关
            case KeyCode.KEY_P:
                this.loadPreviousLevel();
                break;
        }
    }

    /**
     * 加载关卡
     * @param levelId 关卡ID
     */
    async loadLevel(levelId: string): Promise<void> {
        this.gameState = InGameState.LOADING;
        this.currentLevelId = levelId;
        this.moveCount = 0;

        try {
            // 加载关卡JSON
            const levelJson = await this.loadLevelData(levelId);
            this.currentLevelData = levelJson;

            // 初始化关卡
            this.initLevel(levelJson);

            this.gameState = InGameState.IDLE;
            console.log(`[GameController] 关卡 ${levelId} 加载完成`);
        } catch (error) {
            console.error(`[GameController] 加载关卡 ${levelId} 失败:`, error);
            this.gameState = InGameState.IDLE;
        }
    }

    /**
     * 加载关卡数据
     */
    private async loadLevelData(levelId: string): Promise<LevelData> {
        return new Promise((resolve, reject) => {
            const path = `levels/level_${levelId.replace('-', '_')}`;
            
            ResLoader.getInstance().loadRes(path, (err, asset) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(asset as LevelData);
            });
        });
    }

    /**
     * 初始化关卡
     */
    private initLevel(levelData: LevelData): void {
        // 清理旧关卡
        this.clearLevel();

        // 更新UI
        this.updateLevelUI(levelData);

        // 设置网格
        if (this.gridSystem) {
            this.gridSystem.setGridSize(
                levelData.level.grid.width,
                levelData.level.grid.height
            );
            this.gridSystem.setCellSize(levelData.level.grid.cellSize);
        }

        // 创建实体
        this.createEntities(levelData);

        // 初始化规则系统
        if (this.ruleSystem) {
            this.ruleSystem.init(
                levelData.level.rules.initial,
                levelData.level.rules.text_blocks
            );
        }

        // 初始化玩家控制器
        this.initPlayerController(levelData);

        // 设置暗角效果
        this.setupAtmosphere(levelData);

        // 绑定推动事件
        if (this.playerController) {
            this.playerController.onMoveComplete = () => {
                this.onMoveComplete();
            };
            this.playerController.onPushBlock = (blockId, from, to) => {
                this.onPushBlock(blockId, from, to);
            };
        }
    }

    /**
     * 创建关卡实体
     */
    private createEntities(levelData: LevelData): void {
        if (!this.entityFactory) return;

        // 创建墙体
        if (levelData.level.walls) {
            levelData.level.walls.forEach((pos, index) => {
                const wall = this.entityFactory!.createEntity(
                    EntityType.WALL,
                    `wall_${index}`,
                    pos
                );
                this.levelEntities.set(`wall_${index}`, wall);
            });
        }

        // 创建实体
        levelData.level.entities.forEach((entityData) => {
            const entity = this.entityFactory!.createEntity(
                entityData.type as EntityType,
                entityData.id,
                entityData.position,
                entityData.properties
            );
            this.levelEntities.set(entityData.id, entity);
        });

        // 创建规则文字块
        levelData.level.rules.text_blocks.forEach((textBlock) => {
            const textEntity = this.entityFactory!.createEntity(
                EntityType.RULE_TEXT,
                textBlock.id,
                textBlock.position,
                { text: textBlock.text, pushable: textBlock.pushable }
            );
            this.textBlockEntities.set(textBlock.id, textEntity);

            // 注册到规则系统
            if (this.ruleSystem) {
                this.ruleSystem.registerTextBlock(textBlock.id, textEntity, textBlock);
            }
        });
    }

    /**
     * 初始化玩家控制器
     */
    private initPlayerController(levelData: LevelData): void {
        if (!this.playerController) return;

        // 收集玩家实体
        const playerEntities: Array<{ id: string; node: Node; position: Position }> = [];
        const otherEntities: Array<{ id: string; node: Node; type: EntityType; position: Position }> = [];

        this.levelEntities.forEach((node, id) => {
            const entityData = levelData.level.entities.find((e) => e.id === id);
            if (entityData) {
                if (entityData.type === 'player') {
                    playerEntities.push({
                        id,
                        node,
                        position: entityData.position
                    });
                } else {
                    otherEntities.push({
                        id,
                        node,
                        type: entityData.type as EntityType,
                        position: entityData.position
                    });
                }
            }
        });

        this.playerController.initPlayers(playerEntities);
        this.playerController.initEntities(otherEntities);
    }

    /**
     * 设置氛围效果
     */
    private setupAtmosphere(levelData: LevelData): void {
        const atmosphere = levelData.level.atmosphere;

        // 设置暗角
        if (this.vignetteEffect) {
            this.vignetteEffect.intensity = atmosphere.vignette;
            this.vignetteEffect.enabled = true;
        }
    }

    /**
     * 移动完成回调
     */
    private onMoveComplete(): void {
        this.moveCount++;
        this.updateMoveCount();

        // 检查胜利条件
        if (this.checkWinCondition()) {
            this.onLevelComplete();
        }
    }

    /**
     * 推动方块回调
     */
    private onPushBlock(blockId: string, from: Position, to: Position): void {
        // 更新规则文字块位置
        const textBlock = this.textBlockEntities.get(blockId);
        if (textBlock && this.ruleSystem) {
            this.ruleSystem.updateTextBlockPosition(blockId, to);
        }

        // 检查胜利条件
        if (this.checkWinCondition()) {
            this.onLevelComplete();
        }
    }

    /**
     * 检查胜利条件
     */
    private checkWinCondition(): boolean {
        if (!this.currentLevelData || !this.playerController) return false;

        const winCondition = this.currentLevelData.level.win_condition;
        
        switch (winCondition.type) {
            case 'reach_goal':
                return this.checkReachGoalWin();
            case 'block_on_goal':
                return this.checkBlockOnGoalWin();
            case 'rule_active':
                return this.checkRuleActiveWin(winCondition.params);
            case 'custom':
                return this.checkCustomWin();
            default:
                return false;
        }
    }

    /**
     * 检查到达目标点胜利
     */
    private checkReachGoalWin(): boolean {
        // 获取玩家位置
        const playerPositions = this.playerController!.getAllPlayerPositions();
        
        // 获取目标点位置
        const goalEntity = Array.from(this.levelEntities.entries()).find(([id, node]) => {
            return id.startsWith('goal');
        });

        if (!goalEntity) return false;

        // 检查是否有玩家在目标点上
        const goalData = this.currentLevelData!.level.entities.find((e) => e.id === goalEntity[0]);
        if (!goalData) return false;

        for (const pos of playerPositions.values()) {
            if (pos.x === goalData.position.x && pos.y === goalData.position.y) {
                return true;
            }
        }

        return false;
    }

    /**
     * 检查方块在目标点上胜利
     */
    private checkBlockOnGoalWin(): boolean {
        // 获取目标点位置
        const goalData = this.currentLevelData!.level.entities.find((e) => e.type === 'goal');
        if (!goalData) return false;

        // 获取所有方块位置
        const blockPositions = new Map<string, Position>();
        this.levelEntities.forEach((node, id) => {
            if (id.startsWith('block')) {
                const entityData = this.currentLevelData!.level.entities.find((e) => e.id === id);
                if (entityData) {
                    blockPositions.set(id, entityData.position);
                }
            }
        });

        // 检查是否有方块在目标点上
        for (const pos of blockPositions.values()) {
            if (pos.x === goalData.position.x && pos.y === goalData.position.y) {
                return true;
            }
        }

        return false;
    }

    /**
     * 检查规则激活胜利
     */
    private checkRuleActiveWin(params: Record<string, unknown>): boolean {
        if (!this.ruleSystem) return false;

        const rule = params.rule as { subject: string; verb: string; object: string };
        if (!rule) return false;

        return this.ruleSystem.hasRule(rule.subject, rule.verb, rule.object);
    }

    /**
     * 检查自定义胜利条件
     */
    private checkCustomWin(): boolean {
        // 第一关4特殊处理：方块到达目标点或玩家到达目标点
        const goalData = this.currentLevelData!.level.entities.find((e) => e.type === 'goal');
        if (!goalData) return false;

        // 检查玩家
        const playerPositions = this.playerController!.getAllPlayerPositions();
        for (const pos of playerPositions.values()) {
            if (pos.x === goalData.position.x && pos.y === goalData.position.y) {
                return true;
            }
        }

        // 检查方块
        for (const [id, node] of this.levelEntities.entries()) {
            if (id.startsWith('block')) {
                const entityData = this.currentLevelData!.level.entities.find((e) => e.id === id);
                if (entityData) {
                    if (entityData.position.x === goalData.position.x && 
                        entityData.position.y === goalData.position.y) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * 关卡完成
     */
    private onLevelComplete(): void {
        if (this.gameState === InGameState.VICTORY) return;

        this.gameState = InGameState.VICTORY;
        console.log(`[GameController] 关卡 ${this.currentLevelId} 完成！`);

        // 显示胜利UI
        // TODO: 显示胜利弹窗

        // 延迟进入下一关
        this.scheduleOnce(() => {
            this.loadNextLevel();
        }, 2);
    }

    /**
     * 加载下一关
     */
    loadNextLevel(): void {
        const currentIndex = this.LEVEL_IDS.indexOf(this.currentLevelId);
        if (currentIndex < this.LEVEL_IDS.length - 1) {
            const nextLevelId = this.LEVEL_IDS[currentIndex + 1];
            this.loadLevel(nextLevelId);
        } else {
            console.log('[GameController] 所有关卡已完成！');
        }
    }

    /**
     * 加载上一关
     */
    loadPreviousLevel(): void {
        const currentIndex = this.LEVEL_IDS.indexOf(this.currentLevelId);
        if (currentIndex > 0) {
            const prevLevelId = this.LEVEL_IDS[currentIndex - 1];
            this.loadLevel(prevLevelId);
        }
    }

    /**
     * 重置当前关卡
     */
    resetCurrentLevel(): void {
        this.loadLevel(this.currentLevelId);
    }

    /**
     * 清理关卡
     */
    private clearLevel(): void {
        // 清理实体
        if (this.entityFactory) {
            this.entityFactory.clearAllEntities();
        }

        this.levelEntities.clear();
        this.textBlockEntities.clear();

        // 重置规则系统
        if (this.ruleSystem) {
            this.ruleSystem.reset();
        }

        // 重置玩家控制器
        if (this.playerController) {
            this.playerController.reset();
        }

        // 清理网格实体
        if (this.gridSystem) {
            this.gridSystem.clearEntities();
        }
    }

    /**
     * 更新关卡UI
     */
    private updateLevelUI(levelData: LevelData): void {
        if (this.levelNameLabel) {
            this.levelNameLabel.string = `${levelData.level.meta.id} - ${levelData.level.meta.name}`;
        }
        this.updateMoveCount();
    }

    /**
     * 更新步数显示
     */
    private updateMoveCount(): void {
        if (this.moveCountLabel) {
            this.moveCountLabel.string = `步数: ${this.moveCount}`;
        }
    }

    /**
     * 获取当前关卡ID
     */
    getCurrentLevelId(): string {
        return this.currentLevelId;
    }

    /**
     * 获取当前步数
     */
    getMoveCount(): number {
        return this.moveCount;
    }

    /**
     * 调试信息
     */
    debug(): void {
        console.log('=== GameController Debug ===');
        console.log('Current Level:', this.currentLevelId);
        console.log('Game State:', this.gameState);
        console.log('Move Count:', this.moveCount);
        console.log('Entities:', Array.from(this.levelEntities.keys()));
        this.ruleSystem?.debug();
        console.log('===========================');
    }
}
