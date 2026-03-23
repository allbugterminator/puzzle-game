/**
 * 实体类型定义
 * 定义游戏中所有实体类型和属性
 */

export enum EntityType {
    PLAYER = 'player',
    BLOCK = 'block',
    WALL = 'wall',
    GOAL = 'goal',
    RULE_TEXT = 'rule_text',
    SWITCH = 'switch',
    DOOR = 'door'
}

export enum RuleText {
    YOU = '你',
    IS = '是',
    PUSH = '可推',
    STOP = '停止',
    WIN = '胜利',
    BLOCK = '方块',
    WALL = '墙',
    PLAYER = '玩家',
    GOAL = '目标'
}

export interface Position {
    x: number;
    y: number;
}

export interface EntityProperties {
    moveable?: boolean;
    pushable?: boolean;
    solid?: boolean;
    activation_type?: string;
    [key: string]: unknown;
}

export interface EntityData {
    id: string;
    type: EntityType;
    position: Position;
    properties: EntityProperties;
}

export interface RuleData {
    subject: string;
    verb: string;
    object: string;
}

export interface TextBlockData {
    id: string;
    text: string;
    position: Position;
    pushable: boolean;
}

export interface LevelData {
    version: string;
    level: {
        meta: {
            id: string;
            name: string;
            chapter: number;
            difficulty: number;
            unlock_condition: string;
            stars: Record<string, string>;
        };
        grid: {
            width: number;
            height: number;
            cell_size: number;
        };
        camera: {
            type: string;
            position: Position;
            zoom: number;
        };
        entities: EntityData[];
        walls: Position[];
        rules: {
            initial: RuleData[];
            text_blocks: TextBlockData[];
        };
        win_condition: {
            type: string;
            params: Record<string, unknown>;
        };
        atmosphere: {
            background: string;
            vignette: number;
            grain: number;
        };
        hints?: Array<{
            trigger: string;
            text: string;
        }>;
    };
}

export interface GameState {
    currentLevel: string;
    moveCount: number;
    isPaused: boolean;
    isComplete: boolean;
    activeRules: RuleData[];
}
