/**
 * EntityComponent.ts
 * 实体组件 - 附加到实体节点上的标识组件
 */

import { _decorator, Component } from 'cc';
import { EntityData } from '../../managers/LevelManager';

const { ccclass } = _decorator;

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
