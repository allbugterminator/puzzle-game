import { _decorator, Component, Node, EventTarget } from 'cc';
import { RuleData, TextBlockData, Position, EntityType, EntityProperties } from './entities/EntityTypes';

const { ccclass, property } = _decorator;

/**
 * 规则变化事件
 */
export interface RuleChangeEvent {
    oldRules: RuleData[];
    newRules: RuleData[];
    added: RuleData[];
    removed: RuleData[];
}

/**
 * 规则系统
 * 核心系统，负责解析规则文字组合、检测规则生效、更新游戏状态
 */
@ccclass('RuleSystem')
export class RuleSystem extends Component {
    @property
    enableDebug: boolean = true;

    // 规则变化事件
    public static readonly EVENT_RULES_CHANGED = 'rules-changed';
    public eventTarget: EventTarget = new EventTarget();

    // 当前生效的规则
    private activeRules: RuleData[] = [];
    
    // 规则文字块
    private textBlocks: Map<string, TextBlockData> = new Map();
    
    // 规则文字节点
    private textBlockNodes: Map<string, Node> = new Map();
    
    // 实体属性映射（由规则决定）
    private entityProperties: Map<string, EntityProperties> = new Map();

    // 规则方向定义
    private readonly DIRECTIONS = [
        { dx: 1, dy: 0 },   // 水平
        { dx: 0, dy: 1 }    // 垂直
    ];

    onLoad(): void {
        this.initDefaultRules();
    }

    /**
     * 初始化默认规则
     */
    private initDefaultRules(): void {
        // 默认规则会在关卡加载时覆盖
        this.activeRules = [];
    }

    /**
     * 初始化规则系统
     * @param initialRules 初始规则
     * @param textBlocks 规则文字块数据
     */
    init(initialRules: RuleData[], textBlocks: TextBlockData[]): void {
        this.activeRules = [...initialRules];
        
        this.textBlocks.clear();
        textBlocks.forEach((block) => {
            this.textBlocks.set(block.id, block);
        });

        this.updateEntityProperties();
        
        if (this.enableDebug) {
            console.log('[RuleSystem] 初始化完成，当前规则:', this.activeRules);
        }
    }

    /**
     * 注册规则文字节点
     * @param id 文字块ID
     * @param node 节点
     * @param data 数据
     */
    registerTextBlock(id: string, node: Node, data: TextBlockData): void {
        this.textBlockNodes.set(id, node);
        this.textBlocks.set(id, data);
    }

    /**
     * 注销规则文字节点
     * @param id 文字块ID
     */
    unregisterTextBlock(id: string): void {
        this.textBlockNodes.delete(id);
        this.textBlocks.delete(id);
    }

    /**
     * 扫描并更新规则
     * 在文字块移动后调用
     */
    scanAndUpdateRules(): void {
        const oldRules = [...this.activeRules];
        const newRules = this.parseRulesFromTextBlocks();
        
        // 比较规则变化
        const added = this.getRuleDifferences(newRules, oldRules);
        const removed = this.getRuleDifferences(oldRules, newRules);
        
        if (added.length > 0 || removed.length > 0) {
            this.activeRules = newRules;
            this.updateEntityProperties();
            
            const event: RuleChangeEvent = {
                oldRules,
                newRules,
                added,
                removed
            };
            
            this.eventTarget.emit(RuleSystem.EVENT_RULES_CHANGED, event);
            
            if (this.enableDebug) {
                console.log('[RuleSystem] 规则更新:', event);
            }
        }
    }

    /**
     * 从规则文字块解析规则
     * @returns 解析出的规则数组
     */
    private parseRulesFromTextBlocks(): RuleData[] {
        const rules: RuleData[] = [];
        const blocks = Array.from(this.textBlocks.values());
        
        // 构建位置到文字块的映射
        const posToBlock = new Map<string, TextBlockData>();
        blocks.forEach((block) => {
            const key = `${block.position.x},${block.position.y}`;
            posToBlock.set(key, block);
        });

        // 检查所有可能的规则组合（主语 + 是 + 谓语）
        blocks.forEach((block) => {
            const subject = block.text;
            
            // 检查是否是有效主语
            if (!this.isValidSubject(subject)) {
                return;
            }

            // 检查水平方向
            this.checkDirectionForRule(block, posToBlock, 1, 0, subject, rules);
            
            // 检查垂直方向
            this.checkDirectionForRule(block, posToBlock, 0, 1, subject, rules);
        });

        return rules;
    }

    /**
     * 检查某个方向是否存在完整规则
     */
    private checkDirectionForRule(
        startBlock: TextBlockData,
        posToBlock: Map<string, TextBlockData>,
        dx: number,
        dy: number,
        subject: string,
        rules: RuleData[]
    ): void {
        // 检查"是"
        const isKey = `${startBlock.position.x + dx},${startBlock.position.y + dy}`;
        const isBlock = posToBlock.get(isKey);
        
        if (!isBlock || isBlock.text !== '是') {
            return;
        }

        // 检查谓语
        const objectKey = `${startBlock.position.x + dx * 2},${startBlock.position.y + dy * 2}`;
        const objectBlock = posToBlock.get(objectKey);
        
        if (!objectBlock) {
            return;
        }

        const object = objectBlock.text;
        
        // 验证谓语有效性
        if (!this.isValidObject(object)) {
            return;
        }

        // 找到有效规则
        const rule: RuleData = {
            subject: this.mapTextToEntityType(subject),
            verb: 'IS',
            object: this.mapTextToRuleType(object)
        };

        // 检查是否已存在相同规则
        const exists = rules.some((r) => 
            r.subject === rule.subject && 
            r.verb === rule.verb && 
            r.object === rule.object
        );

        if (!exists) {
            rules.push(rule);
        }
    }

    /**
     * 检查是否是有效主语
     */
    private isValidSubject(text: string): boolean {
        const validSubjects = ['你', '方块', '墙', '玩家', '目标', '停止', '胜利', '可推'];
        return validSubjects.includes(text);
    }

    /**
     * 检查是否是有效谓语
     */
    private isValidObject(text: string): boolean {
        const validObjects = ['你', '方块', '墙', '玩家', '目标', '停止', '胜利', '可推'];
        return validObjects.includes(text);
    }

    /**
     * 将文字映射到实体类型
     */
    private mapTextToEntityType(text: string): string {
        const mapping: Record<string, string> = {
            '你': 'player',
            '方块': 'block',
            '墙': 'wall',
            '玩家': 'player',
            '目标': 'goal',
            '停止': 'wall',
            '胜利': 'win',
            '可推': 'push'
        };
        return mapping[text] || text;
    }

    /**
     * 将文字映射到规则类型
     */
    private mapTextToRuleType(text: string): string {
        const mapping: Record<string, string> = {
            '你': 'you',
            '方块': 'block',
            '墙': 'stop',
            '玩家': 'you',
            '目标': 'goal',
            '停止': 'stop',
            '胜利': 'win',
            '可推': 'push'
        };
        return mapping[text] || text;
    }

    /**
     * 更新实体属性
     */
    private updateEntityProperties(): void {
        this.entityProperties.clear();

        this.activeRules.forEach((rule) => {
            const key = rule.subject;
            let props = this.entityProperties.get(key);
            
            if (!props) {
                props = {};
                this.entityProperties.set(key, props);
            }

            // 根据规则对象设置属性
            switch (rule.object) {
                case 'you':
                    props.isPlayer = true;
                    props.controllable = true;
                    break;
                case 'stop':
                    props.solid = true;
                    props.moveable = false;
                    props.pushable = false;
                    break;
                case 'push':
                    props.pushable = true;
                    props.solid = true;
                    break;
                case 'win':
                    props.isWinCondition = true;
                    break;
                case 'block':
                    // 身份转换
                    props.transformTo = 'block';
                    break;
            }
        });
    }

    /**
     * 获取实体属性
     * @param entityType 实体类型
     * @returns 属性对象
     */
    getEntityProperties(entityType: string): EntityProperties {
        return this.entityProperties.get(entityType) || {};
    }

    /**
     * 检查实体是否可推动
     * @param entityType 实体类型
     * @returns 是否可推动
     */
    isPushable(entityType: string): boolean {
        const props = this.getEntityProperties(entityType);
        return props.pushable === true;
    }

    /**
     * 检查实体是否可阻挡
     * @param entityType 实体类型
     * @returns 是否可阻挡
     */
    isSolid(entityType: string): boolean {
        const props = this.getEntityProperties(entityType);
        // 默认为true，除非明确设置为false
        if (props.solid === undefined) {
            // 检查默认规则
            return entityType === 'wall' || entityType === 'block';
        }
        return props.solid === true;
    }

    /**
     * 检查实体是否是玩家
     * @param entityType 实体类型
     * @returns 是否是玩家
     */
    isPlayer(entityType: string): boolean {
        const props = this.getEntityProperties(entityType);
        return props.isPlayer === true || entityType === 'player';
    }

    /**
     * 检查是否是胜利条件
     * @param entityType 实体类型
     * @returns 是否是胜利条件
     */
    isWinCondition(entityType: string): boolean {
        const props = this.getEntityProperties(entityType);
        return props.isWinCondition === true;
    }

    /**
     * 获取当前生效的规则
     * @returns 规则数组
     */
    getActiveRules(): RuleData[] {
        return [...this.activeRules];
    }

    /**
     * 检查特定规则是否生效
     * @param subject 主语
     * @param verb 动词
     * @param object 谓语
     * @returns 是否生效
     */
    hasRule(subject: string, verb: string, object: string): boolean {
        return this.activeRules.some((rule) => 
            rule.subject === subject && 
            rule.verb === verb && 
            rule.object === object
        );
    }

    /**
     * 获取规则差异
     */
    private getRuleDifferences(rulesA: RuleData[], rulesB: RuleData[]): RuleData[] {
        return rulesA.filter((ruleA) => 
            !rulesB.some((ruleB) => 
                ruleB.subject === ruleA.subject && 
                ruleB.verb === ruleA.verb && 
                ruleB.object === ruleA.object
            )
        );
    }

    /**
     * 更新规则文字块位置
     * @param id 文字块ID
     * @param newPos 新位置
     */
    updateTextBlockPosition(id: string, newPos: Position): void {
        const block = this.textBlocks.get(id);
        if (block) {
            block.position = { ...newPos };
            this.scanAndUpdateRules();
        }
    }

    /**
     * 重置规则系统
     */
    reset(): void {
        this.activeRules = [];
        this.textBlocks.clear();
        this.textBlockNodes.clear();
        this.entityProperties.clear();
    }

    /**
     * 添加初始规则
     * @param rules 规则数组
     */
    addInitialRules(rules: RuleData[]): void {
        this.activeRules = [...rules];
        this.updateEntityProperties();
    }

    /**
     * 调试输出当前状态
     */
    debug(): void {
        console.log('=== RuleSystem Debug ===');
        console.log('Active Rules:', this.activeRules);
        console.log('Text Blocks:', Array.from(this.textBlocks.entries()));
        console.log('Entity Properties:', Array.from(this.entityProperties.entries()));
        console.log('=======================');
    }
}
