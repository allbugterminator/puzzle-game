/**
 * WinConditionChecker.ts
 * 胜利条件检测器
 */

import { LevelData, WinCondition, EntityData } from '../managers/LevelManager';
import { EntityComponent } from './EntityFactory';
import { Node, Vec3 } from 'cc';

/**
 * 胜利条件检测器
 */
export class WinConditionChecker {
    private _levelData: LevelData | null = null;
    private _entities: Map<string, Node> = new Map();

    /**
     * 初始化检测器
     */
    public init(levelData: LevelData, entities: Map<string, Node>): void {
        this._levelData = levelData;
        this._entities = entities;
    }

    /**
     * 检查是否胜利
     */
    public checkWin(): boolean {
        if (!this._levelData) return false;

        const condition = this._levelData.winCondition;

        switch (condition.type) {
            case 'reach_goal':
                return this._checkReachGoal(condition.params);

            case 'blocks_on_targets':
                return this._checkBlocksOnTargets(condition.params);

            case 'custom_rule':
                return this._checkCustomRule(condition.params);

            default:
                console.warn(`[WinConditionChecker] 未知的胜利条件类型: ${condition.type}`);
                return false;
        }
    }

    /**
     * 检查到达目标点
     */
    private _checkReachGoal(params: any): boolean {
        const targetId = params?.targetId;
        if (!targetId) return false;

        // 获取玩家位置
        const playerNode = this._getPlayerNode();
        const goalNode = this._entities.get(targetId);

        if (!playerNode || !goalNode) return false;

        const playerPos = playerNode.getWorldPosition();
        const goalPos = goalNode.getWorldPosition();

        // 检查距离
        const distance = Vec3.distance(playerPos, goalPos);
        return distance < 50; // 50像素容错
    }

    /**
     * 检查方块是否在目标点上
     */
    private _checkBlocksOnTargets(params: any): boolean {
        const blockIds: string[] = params?.blockIds || [];
        const targetIds: string[] = params?.targetIds || [];

        if (blockIds.length === 0 || targetIds.length === 0) return false;

        // 每个目标点必须有方块
        for (const targetId of targetIds) {
            const targetNode = this._entities.get(targetId);
            if (!targetNode) continue;

            const targetPos = targetNode.getWorldPosition();

            // 检查是否有方块在目标点上
            let hasBlock = false;
            for (const blockId of blockIds) {
                const blockNode = this._entities.get(blockId);
                if (!blockNode) continue;

                const blockPos = blockNode.getWorldPosition();
                const distance = Vec3.distance(blockPos, targetPos);

                if (distance < 50) {
                    hasBlock = true;
                    break;
                }
            }

            if (!hasBlock) return false;
        }

        return true;
    }

    /**
     * 检查自定义规则
     * 用于"你就是胜利"类型的关卡
     */
    private _checkCustomRule(params: any): boolean {
        const rule = params?.rule;
        if (!rule) return false;

        // 解析规则，例如 "你 IS 胜利"
        const parts = rule.split(/\s+/);
        if (parts.length !== 3) return false;

        const [subject, verb, object] = parts;

        // 检查规则是否成立
        if (subject === '你' && verb === 'IS' && object === '胜利') {
            // 检查玩家是否接触了"胜利"规则文字
            return this._checkPlayerTouchRuleText('胜利');
        }

        return false;
    }

    /**
     * 检查玩家是否接触了指定的规则文字
     */
    private _checkPlayerTouchRuleText(text: string): boolean {
        const playerNode = this._getPlayerNode();
        if (!playerNode) return false;

        const playerPos = playerNode.getWorldPosition();

        // 遍历所有实体，查找规则文字
        for (const [id, node] of this._entities) {
            const entityComp = node.getComponent(EntityComponent);
            if (!entityComp) continue;

            const data = entityComp.data;
            if (data?.type === 'rule_text' && data.properties?.text === text) {
                const textPos = node.getWorldPosition();
                const distance = Vec3.distance(playerPos, textPos);

                if (distance < 50) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 获取玩家节点
     */
    private _getPlayerNode(): Node | null {
        for (const [id, node] of this._entities) {
            const entityComp = node.getComponent(EntityComponent);
            if (entityComp?.data?.type === 'player') {
                return node;
            }
        }
        return null;
    }

    /**
     * 清空
     */
    public clear(): void {
        this._levelData = null;
        this._entities.clear();
    }
}
