import { _decorator, Component, Node, Vec2, Vec3, EventTouch, Input, input, Touch, EventMouse, EventKeyboard, KeyCode, Tween, tween, Animation } from 'cc';
import { Position, EntityType, EntityProperties } from './entities/EntityTypes';
import { GridSystem } from './GridSystem';
import { RuleSystem } from './RuleSystem';

const { ccclass, property } = _decorator;

/**
 * 移动方向枚举
 */
export enum MoveDirection {
    UP = 0,
    RIGHT = 1,
    DOWN = 2,
    LEFT = 3
}

/**
 * 移动方向向量
 */
const DIRECTION_VECTORS: Record<MoveDirection, Position> = {
    [MoveDirection.UP]: { x: 0, y: 1 },
    [MoveDirection.RIGHT]: { x: 1, y: 0 },
    [MoveDirection.DOWN]: { x: 0, y: -1 },
    [MoveDirection.LEFT]: { x: -1, y: 0 }
};

/**
 * 玩家控制器
 * 处理点击/滑动移动、推动方块逻辑、动画播放
 */
@ccclass('PlayerController')
export class PlayerController extends Component {
    @property({ type: GridSystem })
    gridSystem: GridSystem | null = null;

    @property({ type: RuleSystem })
    ruleSystem: RuleSystem | null = null;

    @property
    moveDuration: number = 0.15;

    @property
    pushDuration: number = 0.2;

    @property
    enableSwipe: boolean = true;

    @property
    enableClick: boolean = true;

    // 玩家实体映射（可能多个实体都是"你"）
    private players: Map<string, { node: Node; position: Position }> = new Map();
    
    // 其他实体
    private entities: Map<string, { node: Node; type: EntityType; position: Position }> = new Map();
    
    // 是否正在移动
    private isMoving: boolean = false;
    
    // 触摸起始位置
    private touchStartPos: Vec2 = new Vec2();
    
    // 触摸开始时间
    private touchStartTime: number = 0;
    
    // 移动阈值
    private readonly SWIPE_THRESHOLD = 30;
    private readonly CLICK_THRESHOLD = 10;

    // 移动完成回调
    public onMoveComplete: (() => void) | null = null;
    
    // 推动事件回调
    public onPushBlock: ((blockId: string, from: Position, to: Position) => void) | null = null;

    onLoad(): void {
        this.setupInputHandlers();
    }

    onDestroy(): void {
        this.removeInputHandlers();
    }

    /**
     * 设置输入处理器
     */
    private setupInputHandlers(): void {
        // 触摸事件
        this.node.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        
        // 键盘事件
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    /**
     * 移除输入处理器
     */
    private removeInputHandlers(): void {
        this.node.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    /**
     * 初始化玩家
     * @param playerEntities 玩家实体数组
     */
    initPlayers(playerEntities: Array<{ id: string; node: Node; position: Position }>): void {
        this.players.clear();
        playerEntities.forEach((entity) => {
            this.players.set(entity.id, { node: entity.node, position: { ...entity.position } });
        });
    }

    /**
     * 初始化实体
     * @param entities 实体数组
     */
    initEntities(entities: Array<{ id: string; node: Node; type: EntityType; position: Position }>): void {
        this.entities.clear();
        entities.forEach((entity) => {
            this.entities.set(entity.id, { 
                node: entity.node, 
                type: entity.type, 
                position: { ...entity.position } 
            });
        });
    }

    /**
     * 注册玩家
     * @param id 玩家ID
     * @param node 节点
     * @param position 位置
     */
    registerPlayer(id: string, node: Node, position: Position): void {
        this.players.set(id, { node, position: { ...position } });
    }

    /**
     * 注册实体
     * @param id 实体ID
     * @param node 节点
     * @param type 类型
     * @param position 位置
     */
    registerEntity(id: string, node: Node, type: EntityType, position: Position): void {
        this.entities.set(id, { node, type, position: { ...position } });
    }

    /**
     * 更新实体位置
     * @param id 实体ID
     * @param newPos 新位置
     */
    updateEntityPosition(id: string, newPos: Position): void {
        const player = this.players.get(id);
        if (player) {
            player.position = { ...newPos };
            return;
        }

        const entity = this.entities.get(id);
        if (entity) {
            entity.position = { ...newPos };
        }
    }

    /**
     * 触摸开始
     */
    private onTouchStart(event: EventTouch): void {
        this.touchStartPos = event.getLocation();
        this.touchStartTime = Date.now();
    }

    /**
     * 触摸结束
     */
    private onTouchEnd(event: EventTouch): void {
        if (!this.enableSwipe && !this.enableClick) return;

        const touchEndPos = event.getLocation();
        const deltaX = touchEndPos.x - this.touchStartPos.x;
        const deltaY = touchEndPos.y - this.touchStartPos.y;
        const deltaTime = Date.now() - this.touchStartTime;

        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // 判断是点击还是滑动
        if (distance < this.CLICK_THRESHOLD && this.enableClick) {
            // 点击移动
            this.handleClick(touchEndPos);
        } else if (distance >= this.SWIPE_THRESHOLD && this.enableSwipe) {
            // 滑动移动
            this.handleSwipe(deltaX, deltaY);
        }
    }

    /**
     * 处理点击移动
     */
    private handleClick(screenPos: Vec2): void {
        if (!this.gridSystem) return;

        // 获取主玩家位置
        const mainPlayer = Array.from(this.players.values())[0];
        if (!mainPlayer) return;

        // 转换屏幕坐标为网格坐标
        const targetGridPos = this.gridSystem.screenToGrid(screenPos.x, screenPos.y, this.node);
        if (!targetGridPos) return;

        // 计算移动方向
        const dx = targetGridPos.x - mainPlayer.position.x;
        const dy = targetGridPos.y - mainPlayer.position.y;

        // 只处理相邻格子的点击
        if (Math.abs(dx) + Math.abs(dy) === 1) {
            const direction = this.getDirectionFromDelta(dx, dy);
            if (direction !== null) {
                this.movePlayer(direction);
            }
        }
    }

    /**
     * 处理滑动
     */
    private handleSwipe(deltaX: number, deltaY: number): void {
        // 判断主要滑动方向
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // 水平滑动
            const direction = deltaX > 0 ? MoveDirection.RIGHT : MoveDirection.LEFT;
            this.movePlayer(direction);
        } else {
            // 垂直滑动
            const direction = deltaY > 0 ? MoveDirection.UP : MoveDirection.DOWN;
            this.movePlayer(direction);
        }
    }

    /**
     * 键盘输入
     */
    private onKeyDown(event: EventKeyboard): void {
        switch (event.keyCode) {
            case KeyCode.ARROW_UP:
            case KeyCode.KEY_W:
                this.movePlayer(MoveDirection.UP);
                break;
            case KeyCode.ARROW_DOWN:
            case KeyCode.KEY_S:
                this.movePlayer(MoveDirection.DOWN);
                break;
            case KeyCode.ARROW_LEFT:
            case KeyCode.KEY_A:
                this.movePlayer(MoveDirection.LEFT);
                break;
            case KeyCode.ARROW_RIGHT:
            case KeyCode.KEY_D:
                this.movePlayer(MoveDirection.RIGHT);
                break;
        }
    }

    /**
     * 从位移获取方向
     */
    private getDirectionFromDelta(dx: number, dy: number): MoveDirection | null {
        if (dx === 1 && dy === 0) return MoveDirection.RIGHT;
        if (dx === -1 && dy === 0) return MoveDirection.LEFT;
        if (dx === 0 && dy === 1) return MoveDirection.UP;
        if (dx === 0 && dy === -1) return MoveDirection.DOWN;
        return null;
    }

    /**
     * 移动玩家
     * @param direction 移动方向
     */
    movePlayer(direction: MoveDirection): void {
        if (this.isMoving) return;

        // 获取所有可控制的玩家
        const controllablePlayers = this.getControllablePlayers();
        if (controllablePlayers.length === 0) return;

        const delta = DIRECTION_VECTORS[direction];
        
        // 检查所有玩家是否都可以移动
        const moves: Array<{ playerId: string; from: Position; to: Position; pushedEntity?: { id: string; from: Position; to: Position } }> = [];
        
        for (const playerData of controllablePlayers) {
            const player = this.players.get(playerData.id);
            if (!player) continue;

            const newPos = {
                x: player.position.x + delta.x,
                y: player.position.y + delta.y
            };

            // 检查是否可以移动到这个位置
            const canMoveResult = this.canMoveTo(playerData.id, newPos, delta);
            
            if (!canMoveResult.canMove) {
                return; // 任一玩家无法移动，整体取消
            }

            moves.push({
                playerId: playerData.id,
                from: { ...player.position },
                to: newPos,
                pushedEntity: canMoveResult.pushedEntity
            });
        }

        // 执行移动
        this.executeMoves(moves, direction);
    }

    /**
     * 获取可控制的玩家
     */
    private getControllablePlayers(): Array<{ id: string; node: Node; position: Position }> {
        const result: Array<{ id: string; node: Node; position: Position }> = [];
        
        this.players.forEach((player, id) => {
            // 检查规则系统是否定义此实体为"你"
            if (this.ruleSystem?.isPlayer('player')) {
                result.push({ id, node: player.node, position: player.position });
            }
        });

        // 检查其他实体是否被定义为"你"
        this.entities.forEach((entity, id) => {
            if (this.ruleSystem?.isPlayer(entity.type)) {
                result.push({ id, node: entity.node, position: entity.position });
            }
        });

        return result;
    }

    /**
     * 检查是否可以移动到目标位置
     * @param playerId 玩家ID
     * @param targetPos 目标位置
     * @param delta 位移
     * @returns 移动结果
     */
    private canMoveTo(
        playerId: string, 
        targetPos: Position, 
        delta: Position
    ): { canMove: boolean; pushedEntity?: { id: string; from: Position; to: Position } } {
        // 检查是否在网格范围内
        if (!this.gridSystem?.isValidPosition(targetPos)) {
            return { canMove: false };
        }

        // 检查是否有其他实体
        const entityAtTarget = this.getEntityAt(targetPos);
        
        if (!entityAtTarget) {
            return { canMove: true };
        }

        // 检查实体是否可推动
        if (this.canPushEntity(entityAtTarget.type)) {
            // 检查推动后的位置
            const pushTargetPos = {
                x: targetPos.x + delta.x,
                y: targetPos.y + delta.y
            };

            // 检查推动目标位置
            if (!this.gridSystem?.isValidPosition(pushTargetPos)) {
                return { canMove: false };
            }

            const entityAtPushTarget = this.getEntityAt(pushTargetPos);
            if (entityAtPushTarget) {
                return { canMove: false };
            }

            return {
                canMove: true,
                pushedEntity: {
                    id: entityAtTarget.id,
                    from: targetPos,
                    to: pushTargetPos
                }
            };
        }

        // 实体阻挡
        return { canMove: false };
    }

    /**
     * 获取指定位置的实体
     */
    private getEntityAt(pos: Position): { id: string; type: EntityType } | null {
        // 检查玩家
        for (const [id, player] of this.players.entries()) {
            if (player.position.x === pos.x && player.position.y === pos.y) {
                return { id, type: EntityType.PLAYER };
            }
        }

        // 检查其他实体
        for (const [id, entity] of this.entities.entries()) {
            if (entity.position.x === pos.x && entity.position.y === pos.y) {
                return { id, type: entity.type };
            }
        }

        return null;
    }

    /**
     * 检查实体是否可推动
     */
    private canPushEntity(entityType: EntityType): boolean {
        // 默认推动规则
        if (entityType === EntityType.BLOCK) return true;
        if (entityType === EntityType.RULE_TEXT) return true;
        
        // 检查规则系统
        if (this.ruleSystem?.isPushable(entityType)) {
            return true;
        }

        return false;
    }

    /**
     * 执行移动
     */
    private executeMoves(
        moves: Array<{ playerId: string; from: Position; to: Position; pushedEntity?: { id: string; from: Position; to: Position } }>,
        direction: MoveDirection
    ): void {
        this.isMoving = true;

        const promises: Promise<void>[] = [];

        moves.forEach((move) => {
            // 先推动实体
            if (move.pushedEntity) {
                this.pushEntity(move.pushedEntity.id, move.pushedEntity.to);
                
                // 触发推动事件
                if (this.onPushBlock) {
                    this.onPushBlock(
                        move.pushedEntity.id, 
                        move.pushedEntity.from, 
                        move.pushedEntity.to
                    );
                }
            }

            // 移动玩家
            const promise = this.animateMove(move.playerId, move.to, direction);
            promises.push(promise);

            // 更新位置数据
            this.updateEntityPosition(move.playerId, move.to);
        });

        // 等待所有移动完成
        Promise.all(promises).then(() => {
            this.isMoving = false;
            
            if (this.onMoveComplete) {
                this.onMoveComplete();
            }
        });
    }

    /**
     * 推动实体
     */
    private pushEntity(entityId: string, to: Position): void {
        const entity = this.entities.get(entityId);
        if (!entity || !this.gridSystem) return;

        // 检查是否是规则文字块
        if (entity.type === EntityType.RULE_TEXT) {
            // 通知规则系统更新文字块位置
            this.ruleSystem?.updateTextBlockPosition(entityId, to);
        }

        // 更新实体位置
        entity.position = { ...to };
        
        // 动画移动
        const worldPos = this.gridSystem.gridToWorld(to);
        tween(entity.node)
            .to(this.pushDuration, { position: worldPos }, { easing: 'quadOut' })
            .start();
    }

    /**
     * 动画移动
     */
    private animateMove(entityId: string, to: Position, direction: MoveDirection): Promise<void> {
        return new Promise((resolve) => {
            let entity = this.players.get(entityId);
            if (!entity) {
                entity = this.entities.get(entityId);
            }
            
            if (!entity || !this.gridSystem) {
                resolve();
                return;
            }

            const worldPos = this.gridSystem.gridToWorld(to);

            // 添加移动动画
            tween(entity.node)
                .to(this.moveDuration, { position: worldPos }, { easing: 'quadOut' })
                .call(() => {
                    // 播放移动后的动画
                    this.playMoveAnimation(entity!.node, direction);
                    resolve();
                })
                .start();
        });
    }

    /**
     * 播放移动动画
     */
    private playMoveAnimation(node: Node, direction: MoveDirection): void {
        // 可以在这里添加移动后的动画效果
        // 如脚步特效、轻微弹跳等
    }

    /**
     * 重置控制器
     */
    reset(): void {
        this.players.clear();
        this.entities.clear();
        this.isMoving = false;
    }

    /**
     * 获取玩家当前位置
     * @param playerId 玩家ID
     * @returns 位置或null
     */
    getPlayerPosition(playerId: string): Position | null {
        const player = this.players.get(playerId);
        return player ? { ...player.position } : null;
    }

    /**
     * 获取所有玩家位置
     */
    getAllPlayerPositions(): Map<string, Position> {
        const positions = new Map<string, Position>();
        this.players.forEach((player, id) => {
            positions.set(id, { ...player.position });
        });
        return positions;
    }

    /**
     * 获取实体位置
     * @param entityId 实体ID
     */
    getEntityPosition(entityId: string): Position | null {
        const entity = this.entities.get(entityId);
        return entity ? { ...entity.position } : null;
    }
}
