/**
 * TutorialGameController.ts
 * 教学关游戏控制器
 *
 * 功能：
 * - 加载和切换前5关教学关
 * - 按H键切换关卡
 * - 网格渲染
 * - 实体管理
 * - 移动和推动逻辑
 * - 胜利条件检测
 */

import {
    _decorator,
    Component,
    Node,
    Vec3,
    input,
    Input,
    EventKeyboard,
    KeyCode,
    Color,
    Label,
    director,
    warn,
    log,
    error,
    UITransform
} from 'cc';
import { LevelLoader } from './LevelLoader';
import { GridRenderer } from './GridRenderer';
import { EntityFactory, EntityComponent, EntityType } from './EntityFactory';
import { WinConditionChecker } from './WinConditionChecker';
import { LevelData, EntityData, GridPos } from '../managers/LevelManager';
import { EventBus } from '../core/EventBus';
import { VignetteEffect } from './effects/VignetteEffect';
import { ColorGrading } from './effects/ColorGrading';

const { ccclass, property } = _decorator;

/** 移动方向 */
export enum Direction {
    UP = 0,
    RIGHT = 1,
    DOWN = 2,
    LEFT = 3
}

const DIRECTION_VECTORS = [
    new Vec3(0, 1, 0),   // UP
    new Vec3(1, 0, 0),   // RIGHT
    new Vec3(0, -1, 0),  // DOWN
    new Vec3(-1, 0, 0)   // LEFT
];

/**
 * 教学关游戏控制器
 */
@ccclass('TutorialGameController')
export class TutorialGameController extends Component {
    @property(Node)
    gameContainer: Node = null;

    @property(GridRenderer)
    gridRenderer: GridRenderer = null;

    @property(EntityFactory)
    entityFactory: EntityFactory = null;

    @property(Label)
    levelNameLabel: Label = null;

    @property(Label)
    movesLabel: Label = null;

    @property(Label)
    hintLabel: Label = null;

    @property(VignetteEffect)
    vignetteEffect: VignetteEffect = null;

    @property(ColorGrading)
    colorGrading: ColorGrading = null;

    // 关卡配置
    private readonly TUTORIAL_LEVELS = [101, 102, 103, 104, 105];
    private _currentLevelIndex: number = 0;

    // 游戏状态
    private _currentLevel: LevelData | null = null;
    private _entities: Map<string, Node> = new Map();
    private _playerNode: Node | null = null;
    private _moves: number = 0;
    private _isProcessingMove: boolean = false;
    private _isLevelComplete: boolean = false;

    // 系统组件
    private _levelLoader: LevelLoader;
    private _winChecker: WinConditionChecker;
    private _eventBus: EventBus;

    onLoad() {
        this._levelLoader = LevelLoader.getInstance();
        this._winChecker = new WinConditionChecker();
        this._eventBus = EventBus.getInstance();

        this._setupInput();
        this._initVisualEffects();
    }

    async start() {
        // 加载第一关
        await this._loadLevel(this.TUTORIAL_LEVELS[0]);
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    /**
     * 初始化视觉效果
     */
    private _initVisualEffects(): void {
        // 设置暗角效果
        if (this.vignetteEffect) {
            this.vignetteEffect.setIntensity(0.4, 0);
            this.vignetteEffect.setSmoothness(1.2);
        }

        // 设置色彩分级
        if (this.colorGrading) {
            this.colorGrading.applyPreset('MYSTERIOUS', 0);
        }
    }

    /**
     * 设置输入监听
     */
    private _setupInput(): void {
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    /**
     * 处理键盘输入
     */
    private _onKeyDown(event: EventKeyboard): void {
        if (this._isLevelComplete) {
            // 关卡完成后，任意键进入下一关
            if (event.keyCode === KeyCode.KEY_N || event.keyCode === KeyCode.SPACE) {
                this._nextLevel();
            }
            return;
        }

        if (this._isProcessingMove) return;

        switch (event.keyCode) {
            // 移动控制
            case KeyCode.ARROW_UP:
            case KeyCode.KEY_W:
                this._tryMove(Direction.UP);
                break;
            case KeyCode.ARROW_RIGHT:
            case KeyCode.KEY_D:
                this._tryMove(Direction.RIGHT);
                break;
            case KeyCode.ARROW_DOWN:
            case KeyCode.KEY_S:
                this._tryMove(Direction.DOWN);
                break;
            case KeyCode.ARROW_LEFT:
            case KeyCode.KEY_A:
                this._tryMove(Direction.LEFT);
                break;

            // 关卡切换
            case KeyCode.KEY_H:
                this._showHelp();
                break;
            case KeyCode.KEY_R:
                this._restartLevel();
                break;
            case KeyCode.DIGIT_1:
                this._switchToLevel(0);
                break;
            case KeyCode.DIGIT_2:
                this._switchToLevel(1);
                break;
            case KeyCode.DIGIT_3:
                this._switchToLevel(2);
                break;
            case KeyCode.DIGIT_4:
                this._switchToLevel(3);
                break;
            case KeyCode.DIGIT_5:
                this._switchToLevel(4);
                break;
        }
    }

    /**
     * 加载关卡
     */
    private async _loadLevel(levelId: number): Promise<void> {
        log(`[TutorialGameController] 加载关卡: ${levelId}`);

        // 清理当前关卡
        this._clearLevel();

        // 加载关卡数据
        this._currentLevel = await this._levelLoader.loadLevel(levelId);
        if (!this._currentLevel) {
            error(`[TutorialGameController] 关卡加载失败: ${levelId}`);
            return;
        }

        // 渲染网格
        this._renderGrid();

        // 创建实体
        this._createEntities();

        // 初始化胜利检测器
        this._winChecker.init(this._currentLevel, this._entities);

        // 重置状态
        this._moves = 0;
        this._isProcessingMove = false;
        this._isLevelComplete = false;

        // 更新UI
        this._updateUI();

        log(`[TutorialGameController] 关卡加载完成: ${this._currentLevel.meta.name}`);
    }

    /**
     * 渲染网格
     */
    private _renderGrid(): void {
        if (this.gridRenderer && this._currentLevel) {
            this.gridRenderer.renderLevel(this._currentLevel);
        }
    }

    /**
     * 创建实体
     */
    private _createEntities(): void {
        if (!this._currentLevel || !this.entityFactory) return;

        const cellSize = this._currentLevel.grid.cellSize;

        for (const entityData of this._currentLevel.entities) {
            const entity = this.entityFactory.createEntity(entityData, cellSize);
            entity.parent = this.gameContainer;

            // 设置位置
            const worldPos = this._gridToWorld(entityData.position.x, entityData.position.y);
            entity.setPosition(worldPos);

            this._entities.set(entityData.id, entity);

            // 记录玩家节点
            if (entityData.type === 'player') {
                this._playerNode = entity;
            }
        }
    }

    /**
     * 尝试移动
     */
    private async _tryMove(direction: Direction): Promise<void> {
        if (!this._playerNode || !this._currentLevel || this._isProcessingMove) return;

        this._isProcessingMove = true;

        // 获取玩家当前网格位置
        const playerComp = this._playerNode.getComponent(EntityComponent);
        const currentPos = playerComp.gridPosition;

        // 计算目标位置
        const dirVec = DIRECTION_VECTORS[direction];
        const targetX = currentPos.x + dirVec.x;
        const targetY = currentPos.y + dirVec.y;

        // 检查边界
        if (!this._isValidGridPosition(targetX, targetY)) {
            this._isProcessingMove = false;
            return;
        }

        // 检查目标位置的实体
        const targetEntity = this._getEntityAtPosition(targetX, targetY);

        if (!targetEntity) {
            // 空位置，直接移动
            await this._moveEntity(this._playerNode, targetX, targetY);
        } else {
            const targetComp = targetEntity.getComponent(EntityComponent);
            const targetType = targetComp.data?.type;

            if (targetType === 'push_block' || targetType === 'rule_text') {
                // 尝试推动
                const pushTargetX = targetX + dirVec.x;
                const pushTargetY = targetY + dirVec.y;

                if (this._canPush(targetX, targetY, pushTargetX, pushTargetY)) {
                    // 先推动方块
                    await this._moveEntity(targetEntity, pushTargetX, pushTargetY);
                    // 再移动玩家
                    await this._moveEntity(this._playerNode, targetX, targetY);
                }
            } else if (targetType === 'goal') {
                // 移动到出口
                await this._moveEntity(this._playerNode, targetX, targetY);
            }
        }

        // 检查胜利条件
        if (this._winChecker.checkWin()) {
            this._onLevelComplete();
        }

        this._isProcessingMove = false;
    }

    /**
     * 移动实体
     */
    private async _moveEntity(entity: Node, gridX: number, gridY: number): Promise<void> {
        return new Promise((resolve) => {
            const entityComp = entity.getComponent(EntityComponent);
            const startPos = entity.getPosition();
            const targetPos = this._gridToWorld(gridX, gridY);

            // 更新网格位置
            entityComp.setGridPosition(gridX, gridY);

            // 简单动画（可以优化为tween动画）
            entity.setPosition(targetPos);

            // 如果是玩家移动，增加步数
            if (entity === this._playerNode) {
                this._moves++;
                this._updateUI();
            }

            setTimeout(resolve, 100);
        });
    }

    /**
     * 检查是否可以推动
     */
    private _canPush(fromX: number, fromY: number, toX: number, toY: number): boolean {
        // 检查边界
        if (!this._isValidGridPosition(toX, toY)) return false;

        // 检查目标位置是否有障碍物
        const targetEntity = this._getEntityAtPosition(toX, toY);
        if (targetEntity) {
            const targetComp = targetEntity.getComponent(EntityComponent);
            const targetType = targetComp.data?.type;
            // 不能推入障碍物或方块
            if (targetType === 'obstacle' || targetType === 'block' || targetType === 'push_block') {
                return false;
            }
        }

        return true;
    }

    /**
     * 获取指定位置的实体
     */
    private _getEntityAtPosition(x: number, y: number): Node | null {
        for (const [id, entity] of this._entities) {
            const comp = entity.getComponent(EntityComponent);
            if (comp) {
                const pos = comp.gridPosition;
                if (pos.x === x && pos.y === y) {
                    return entity;
                }
            }
        }
        return null;
    }

    /**
     * 检查网格位置是否有效
     */
    private _isValidGridPosition(x: number, y: number): boolean {
        if (!this._currentLevel) return false;
        const { width, height } = this._currentLevel.grid;
        return x >= 0 && x < width && y >= 0 && y < height;
    }

    /**
     * 网格坐标转世界坐标
     */
    private _gridToWorld(gridX: number, gridY: number): Vec3 {
        if (!this._currentLevel) return Vec3.ZERO;
        const { width, height, cellSize } = this._currentLevel.grid;
        const totalWidth = width * cellSize;
        const totalHeight = height * cellSize;
        const offsetX = -totalWidth / 2;
        const offsetY = -totalHeight / 2;

        const x = offsetX + gridX * cellSize + cellSize / 2;
        const y = offsetY + gridY * cellSize + cellSize / 2;

        return new Vec3(x, y, 0);
    }

    /**
     * 关卡完成
     */
    private _onLevelComplete(): void {
        this._isLevelComplete = true;
        log(`[TutorialGameController] 关卡完成! 步数: ${this._moves}`);

        // 显示完成效果
        if (this.hintLabel) {
            this.hintLabel.string = '关卡完成! 按N键进入下一关';
            this.hintLabel.color = new Color(100, 255, 100, 255);
        }

        // 触发特效
        if (this.vignetteEffect) {
            this.vignetteEffect.pulse(0.3, 0.5);
        }

        // 发送事件
        this._eventBus.emit('level:complete', {
            levelId: this._currentLevel?.meta.id,
            moves: this._moves
        });
    }

    /**
     * 更新UI
     */
    private _updateUI(): void {
        if (this._currentLevel) {
            if (this.levelNameLabel) {
                this.levelNameLabel.string = this._currentLevel.meta.name;
            }
            if (this.hintLabel) {
                this.hintLabel.string = this._currentLevel.meta.hint || '';
                this.hintLabel.color = new Color(200, 200, 200, 255);
            }
        }

        if (this.movesLabel) {
            this.movesLabel.string = `步数: ${this._moves}`;
        }
    }

    /**
     * 清理关卡
     */
    private _clearLevel(): void {
        // 清理实体
        if (this.entityFactory) {
            this.entityFactory.clear();
        }
        this._entities.clear();
        this._playerNode = null;

        // 清理网格
        if (this.gridRenderer) {
            this.gridRenderer.clear();
        }

        // 清理胜利检测器
        this._winChecker.clear();
    }

    /**
     * 切换关卡
     */
    private async _switchToLevel(index: number): Promise<void> {
        if (index < 0 || index >= this.TUTORIAL_LEVELS.length) return;

        this._currentLevelIndex = index;
        await this._loadLevel(this.TUTORIAL_LEVELS[index]);
    }

    /**
     * 下一关
     */
    private async _nextLevel(): Promise<void> {
        const nextIndex = this._currentLevelIndex + 1;
        if (nextIndex < this.TUTORIAL_LEVELS.length) {
            await this._switchToLevel(nextIndex);
        } else {
            // 教学关结束
            log('[TutorialGameController] 教学关完成!');
            if (this.hintLabel) {
                this.hintLabel.string = '恭喜完成所有教学关!';
            }
        }
    }

    /**
     * 重启当前关卡
     */
    private async _restartLevel(): Promise<void> {
        await this._loadLevel(this.TUTORIAL_LEVELS[this._currentLevelIndex]);
    }

    /**
     * 显示帮助
     */
    private _showHelp(): void {
        log('[TutorialGameController] 显示帮助');
        const helpText = `
操作说明:
↑↓←↑ / WASD - 移动
数字键 1-5 - 切换关卡
R - 重启关卡
H - 显示帮助

当前关卡: ${this._currentLevel?.meta.name || '未知'}
        `;
        alert(helpText);
    }
}
