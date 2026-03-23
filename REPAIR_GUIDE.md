# 项目修复指南

## 问题说明

Cocos Creator 3.8.8 打开项目时出现以下错误：
- `Cannot read properties of undefined (reading '_name')`
- `Each script can have at most one Component`
- `Enum is not defined`

## 修复步骤

### 步骤1：使用简化场景

1. 在 Cocos Creator 中打开项目
2. 不要打开 `Game.scene`，而是打开 `GameSimple.scene`
3. 这个简化场景只包含基础 UI，没有自定义组件

### 步骤2：手动添加游戏组件

在 `GameSimple.scene` 中：

1. **创建 GridSystem 节点**
   - 在 Canvas 下创建空节点，命名为 "GridSystem"
   - 添加组件 → 自定义脚本 → `GridSystem.ts`
   - 配置属性：
     - Cell Size: 64
     - Grid Width: 8
     - Grid Height: 8

2. **创建 EntityContainer 节点**
   - 在 Canvas 下创建空节点，命名为 "EntityContainer"
   - 添加 `cc.UITransform` 组件

3. **创建 GameController 节点**
   - 在 Canvas 下创建空节点，命名为 "GameController"
   - 添加组件 → 自定义脚本 → `GameController.ts`
   - 将其他节点拖拽到对应属性槽

### 步骤3：修复模块格式（已自动修复）

已将 `settings/project.json` 中的 `moduleFormat` 从 `"esm"` 改为 `"cjs"`。

### 步骤4：重新编译脚本

在 Cocos Creator 中：
1. 点击菜单 `开发者` → `编译脚本`
2. 或者重启 Cocos Creator

## 替代方案：重新创建场景

如果上述方法不行，可以：

1. 新建场景（Ctrl+N）
2. 保存为 `GameNew.scene`
3. 添加 Canvas 节点（自动创建）
4. 添加 Camera
5. 按照代码中的组件依赖手动添加脚本

## 文件说明

| 文件 | 说明 |
|------|------|
| `Game.scene` | 原场景（有兼容性问题） |
| `GameSimple.scene` | 简化场景（推荐先用这个） |
| `Boot.scene` | 启动场景（应该正常） |
| `Home.scene` | 主菜单场景（应该正常） |

## 测试方法

1. 打开 `GameSimple.scene`
2. 点击预览按钮
3. 如果能看到 UI 文字，说明基础场景正常
4. 然后逐步添加自定义组件

## 代码结构

```
assets/scripts/gameplay/
├── GridSystem.ts          # 网格系统
├── PlayerController.ts    # 玩家控制
├── EntityFactory.ts       # 实体工厂
├── RuleSystem.ts          # 规则系统（核心）
├── controllers/
│   └── GameController.ts  # 游戏控制器
└── entities/
    └── EntityTypes.ts     # 类型定义
```

## 如果还有问题

1. 检查 Cocos Creator 版本是否为 3.8.x
2. 检查 TypeScript 编译器是否正常
3. 尝试删除 `library` 和 `temp` 文件夹后重启
4. 检查控制台具体的错误信息

## 联系方式

如有问题，请反馈具体错误信息。