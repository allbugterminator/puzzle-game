/**
 * GridRenderer.ts
 * 网格渲染器 - 渲染游戏网格和背景
 *
 * TODO: 美术资源配合
 * - 网格纹理
 * - 地板纹理
 * - 墙体纹理
 */

import {
    _decorator,
    Component,
    Node,
    Graphics,
    Color,
    Vec3,
    UITransform,
    Sprite,
    SpriteFrame,
    Texture2D,
    Size,
    view,
    Vec2,
    Label,
    instantiate,
    Prefab
} from 'cc';
import { LevelData } from '../managers/LevelManager';

const { ccclass, property } = _decorator;

/**
 * 网格渲染器
 */
@ccclass('GridRenderer')
export class GridRenderer extends Component {
    @property(Graphics)
    gridGraphics: Graphics = null;

    @property(Color)
    gridColor: Color = new Color(40, 40, 60, 100);

    @property(Color)
    backgroundColor: Color = new Color(26, 26, 46, 255);

    @property(Color)
    gridLineColor: Color = new Color(60, 60, 80, 150);

    private _levelData: LevelData | null = null;
    private _gridCells: Node[][] = [];
    private _gridContainer: Node = null;

    onLoad() {
        this._createGridContainer();
    }

    /**
     * 创建网格容器
     */
    private _createGridContainer(): void {
        this._gridContainer = new Node('GridContainer');
        this._gridContainer.parent = this.node;
        this._gridContainer.setPosition(0, 0, 0);
    }

    /**
     * 渲染关卡网格
     */
    public renderLevel(levelData: LevelData): void {
        this._levelData = levelData;
        this.clear();

        const { width, height, cellSize } = levelData.grid;

        // 设置节点大小
        const uiTransform = this.node.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setContentSize(width * cellSize, height * cellSize);
        }

        // 绘制背景
        this._drawBackground(width, height, cellSize);

        // 绘制网格线
        this._drawGridLines(width, height, cellSize);

        console.log(`[GridRenderer] 渲染网格: ${width}x${height}, 单元格: ${cellSize}`);
    }

    /**
     * 绘制背景
     */
    private _drawBackground(width: number, height: number, cellSize: number): void {
        if (!this.gridGraphics) return;

        const g = this.gridGraphics;
        const totalWidth = width * cellSize;
        const totalHeight = height * cellSize;
        const offsetX = -totalWidth / 2;
        const offsetY = -totalHeight / 2;

        // 绘制背景色
        g.fillColor = this.backgroundColor;
        g.fillRect(offsetX, offsetY, totalWidth, totalHeight);

        // 绘制渐变色效果（简单实现）
        // TODO: 美术提供背景纹理
        for (let i = 0; i < 5; i++) {
            const alpha = 20 - i * 4;
            g.fillColor = new Color(20, 20, 35, alpha);
            const inset = i * 20;
            g.fillRect(
                offsetX + inset,
                offsetY + inset,
                totalWidth - inset * 2,
                totalHeight - inset * 2
            );
        }
    }

    /**
     * 绘制网格线
     */
    private _drawGridLines(width: number, height: number, cellSize: number): void {
        if (!this.gridGraphics) return;

        const g = this.gridGraphics;
        const totalWidth = width * cellSize;
        const totalHeight = height * cellSize;
        const offsetX = -totalWidth / 2;
        const offsetY = -totalHeight / 2;

        g.strokeColor = this.gridLineColor;
        g.lineWidth = 1;

        // 垂直线
        for (let x = 0; x <= width; x++) {
            const px = offsetX + x * cellSize;
            g.moveTo(px, offsetY);
            g.lineTo(px, offsetY + totalHeight);
        }

        // 水平线
        for (let y = 0; y <= height; y++) {
            const py = offsetY + y * cellSize;
            g.moveTo(offsetX, py);
            g.lineTo(offsetX + totalWidth, py);
        }

        g.stroke();
    }

    /**
     * 获取网格单元格的世界坐标
     */
    public getCellWorldPosition(gridX: number, gridY: number): Vec3 {
        if (!this._levelData) return Vec3.ZERO;

        const { width, height, cellSize } = this._levelData.grid;
        const totalWidth = width * cellSize;
        const totalHeight = height * cellSize;
        const offsetX = -totalWidth / 2;
        const offsetY = -totalHeight / 2;

        const x = offsetX + gridX * cellSize + cellSize / 2;
        const y = offsetY + gridY * cellSize + cellSize / 2;

        // 转换为世界坐标
        const worldPos = new Vec3(x, y, 0);
        this.node.inverseTransformPoint(worldPos, worldPos);
        return worldPos;
    }

    /**
     * 网格坐标转世界坐标
     */
    public gridToWorld(gridX: number, gridY: number): Vec3 {
        if (!this._levelData) return Vec3.ZERO;

        const { width, height, cellSize } = this._levelData.grid;
        const totalWidth = width * cellSize;
        const totalHeight = height * cellSize;
        const offsetX = -totalWidth / 2;
        const offsetY = -totalHeight / 2;

        const x = offsetX + gridX * cellSize + cellSize / 2;
        const y = offsetY + gridY * cellSize + cellSize / 2;

        return new Vec3(x, y, 0);
    }

    /**
     * 世界坐标转网格坐标
     */
    public worldToGrid(worldPos: Vec3): { x: number; y: number } {
        if (!this._levelData) return { x: 0, y: 0 };

        const { width, height, cellSize } = this._levelData.grid;
        const totalWidth = width * cellSize;
        const totalHeight = height * cellSize;
        const offsetX = -totalWidth / 2;
        const offsetY = -totalHeight / 2;

        const gridX = Math.floor((worldPos.x - offsetX) / cellSize);
        const gridY = Math.floor((worldPos.y - offsetY) / cellSize);

        return {
            x: Math.max(0, Math.min(width - 1, gridX)),
            y: Math.max(0, Math.min(height - 1, gridY))
        };
    }

    /**
     * 检查网格坐标是否有效
     */
    public isValidGridPosition(x: number, y: number): boolean {
        if (!this._levelData) return false;
        const { width, height } = this._levelData.grid;
        return x >= 0 && x < width && y >= 0 && y < height;
    }

    /**
     * 高亮单元格
     */
    public highlightCell(gridX: number, gridY: number, color: Color): void {
        if (!this.gridGraphics || !this.isValidGridPosition(gridX, gridY)) return;

        const { cellSize } = this._levelData!.grid;
        const pos = this.gridToWorld(gridX, gridY);
        const halfSize = cellSize / 2;

        const g = this.gridGraphics;
        g.fillColor = color;
        g.fillRect(
            pos.x - halfSize + 2,
            pos.y - halfSize + 2,
            cellSize - 4,
            cellSize - 4
        );
    }

    /**
     * 清除高亮
     */
    public clearHighlight(): void {
        if (!this._levelData) return;
        this.renderLevel(this._levelData);
    }

    /**
     * 清空渲染
     */
    public clear(): void {
        if (this.gridGraphics) {
            this.gridGraphics.clear();
        }
        this._gridCells = [];
    }
}
