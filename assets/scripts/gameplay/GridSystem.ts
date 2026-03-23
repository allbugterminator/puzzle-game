import { _decorator, Component, Node, Graphics, Color, Vec2, Vec3, UITransform } from 'cc';
import { Position } from './entities/EntityTypes';

const { ccclass, property } = _decorator;

/**
 * 网格系统
 * 负责网格渲染、坐标转换和实体位置管理
 */
@ccclass('GridSystem')
export class GridSystem extends Component {
    @property({ type: Node })
    gridContainer: Node | null = null;

    @property
    cellSize: number = 64;

    @property
    gridWidth: number = 8;

    @property
    gridHeight: number = 8;

    @property({ type: Color })
    gridLineColor: Color = new Color(22, 33, 62, 255); // #16213E

    @property({ type: Color })
    gridBackgroundColor: Color = new Color(26, 26, 46, 255); // #1A1A2E

    private graphics: Graphics | null = null;
    private entityMap: Map<string, Node> = new Map();
    private gridOffset: Vec2 = new Vec2(0, 0);

    onLoad(): void {
        this.initGraphics();
        this.calculateGridOffset();
    }

    start(): void {
        this.drawGrid();
    }

    /**
     * 初始化Graphics组件
     */
    private initGraphics(): void {
        this.graphics = this.getComponent(Graphics);
        if (!this.graphics) {
            this.graphics = this.addComponent(Graphics);
        }
    }

    /**
     * 计算网格偏移（居中显示）
     */
    private calculateGridOffset(): void {
        const totalWidth = this.gridWidth * this.cellSize;
        const totalHeight = this.gridHeight * this.cellSize;
        
        // 假设屏幕中心为(0,0)，计算左上角偏移
        this.gridOffset.x = -totalWidth / 2;
        this.gridOffset.y = -totalHeight / 2;
    }

    /**
     * 绘制网格
     */
    drawGrid(): void {
        if (!this.graphics) return;

        this.graphics.clear();
        
        const totalWidth = this.gridWidth * this.cellSize;
        const totalHeight = this.gridHeight * this.cellSize;

        // 绘制背景
        this.graphics.fillColor = this.gridBackgroundColor;
        this.graphics.rect(
            this.gridOffset.x,
            this.gridOffset.y,
            totalWidth,
            totalHeight
        );
        this.graphics.fill();

        // 绘制网格线
        this.graphics.strokeColor = this.gridLineColor;
        this.graphics.lineWidth = 1;

        // 垂直线
        for (let x = 0; x <= this.gridWidth; x++) {
            const xPos = this.gridOffset.x + x * this.cellSize;
            this.graphics.moveTo(xPos, this.gridOffset.y);
            this.graphics.lineTo(xPos, this.gridOffset.y + totalHeight);
        }

        // 水平线
        for (let y = 0; y <= this.gridHeight; y++) {
            const yPos = this.gridOffset.y + y * this.cellSize;
            this.graphics.moveTo(this.gridOffset.x, yPos);
            this.graphics.lineTo(this.gridOffset.x + totalWidth, yPos);
        }

        this.graphics.stroke();
    }

    /**
     * 网格坐标转换为世界坐标
     * @param gridPos 网格坐标
     * @returns 世界坐标（网格中心点）
     */
    gridToWorld(gridPos: Position): Vec3 {
        const worldX = this.gridOffset.x + gridPos.x * this.cellSize + this.cellSize / 2;
        const worldY = this.gridOffset.y + gridPos.y * this.cellSize + this.cellSize / 2;
        return new Vec3(worldX, worldY, 0);
    }

    /**
     * 世界坐标转换为网格坐标
     * @param worldPos 世界坐标
     * @returns 网格坐标
     */
    worldToGrid(worldPos: Vec3): Position {
        const gridX = Math.floor((worldPos.x - this.gridOffset.x) / this.cellSize);
        const gridY = Math.floor((worldPos.y - this.gridOffset.y) / this.cellSize);
        return { x: gridX, y: gridY };
    }

    /**
     * 屏幕坐标转换为网格坐标
     * @param screenX 屏幕X坐标
     * @param screenY 屏幕Y坐标
     * @param camera 主相机
     * @returns 网格坐标
     */
    screenToGrid(screenX: number, screenY: number, camera: Node): Position | null {
        // 将屏幕坐标转换为世界坐标
        const worldPos = this.screenToWorld(screenX, screenY, camera);
        if (!worldPos) return null;
        return this.worldToGrid(worldPos);
    }

    /**
     * 屏幕坐标转世界坐标
     */
    private screenToWorld(screenX: number, screenY: number, camera: Node): Vec3 | null {
        // 简化的转换，实际需要根据相机设置调整
        const uiTransform = this.node.getComponent(UITransform);
        if (!uiTransform) return null;

        // 将屏幕坐标转换为本地坐标
        const localPos = uiTransform.convertToNodeSpaceAR(new Vec3(screenX, screenY, 0));
        return localPos;
    }

    /**
     * 设置网格尺寸
     * @param width 宽度
     * @param height 高度
     */
    setGridSize(width: number, height: number): void {
        this.gridWidth = width;
        this.gridHeight = height;
        this.calculateGridOffset();
        this.drawGrid();
    }

    /**
     * 设置格子大小
     * @param size 格子大小
     */
    setCellSize(size: number): void {
        this.cellSize = size;
        this.calculateGridOffset();
        this.drawGrid();
    }

    /**
     * 检查坐标是否在网格范围内
     * @param pos 网格坐标
     * @returns 是否在范围内
     */
    isValidPosition(pos: Position): boolean {
        return pos.x >= 0 && pos.x < this.gridWidth && 
               pos.y >= 0 && pos.y < this.gridHeight;
    }

    /**
     * 注册实体到指定位置
     * @param entityId 实体ID
     * @param entity 实体节点
     * @param gridPos 网格位置
     */
    registerEntity(entityId: string, entity: Node, gridPos: Position): void {
        const key = this.getPositionKey(gridPos);
        this.entityMap.set(key, entity);
        entity.setPosition(this.gridToWorld(gridPos));
    }

    /**
     * 注销实体
     * @param gridPos 网格位置
     */
    unregisterEntity(gridPos: Position): void {
        const key = this.getPositionKey(gridPos);
        this.entityMap.delete(key);
    }

    /**
     * 获取指定位置的实体
     * @param pos 网格位置
     * @returns 实体节点或null
     */
    getEntityAt(pos: Position): Node | null {
        const key = this.getPositionKey(pos);
        return this.entityMap.get(key) || null;
    }

    /**
     * 移动实体到新位置
     * @param entityId 实体ID
     * @param oldPos 旧位置
     * @param newPos 新位置
     * @returns 是否移动成功
     */
    moveEntity(entityId: string, oldPos: Position, newPos: Position): boolean {
        if (!this.isValidPosition(newPos)) {
            return false;
        }

        const oldKey = this.getPositionKey(oldPos);
        const newKey = this.getPositionKey(newPos);
        const entity = this.entityMap.get(oldKey);

        if (!entity) {
            return false;
        }

        this.entityMap.delete(oldKey);
        this.entityMap.set(newKey, entity);
        entity.setPosition(this.gridToWorld(newPos));

        return true;
    }

    /**
     * 清空所有实体
     */
    clearEntities(): void {
        this.entityMap.clear();
    }

    /**
     * 获取位置键值
     */
    private getPositionKey(pos: Position): string {
        return `${pos.x},${pos.y}`;
    }

    /**
     * 高亮显示特定格子
     * @param pos 网格位置
     * @param color 高亮颜色
     */
    highlightCell(pos: Position, color: Color): void {
        if (!this.graphics || !this.isValidPosition(pos)) return;

        const worldPos = this.gridToWorld(pos);
        const halfSize = this.cellSize / 2;

        this.graphics.fillColor = color;
        this.graphics.rect(
            worldPos.x - halfSize,
            worldPos.y - halfSize,
            this.cellSize,
            this.cellSize
        );
        this.graphics.fill();
    }
}
