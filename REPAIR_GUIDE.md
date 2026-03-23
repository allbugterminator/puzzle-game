# 项目修复指南

## 问题说明

Cocos Creator 3.8.8 打开项目时出现以下错误：
- `Cannot read properties of undefined (reading '_name')`
- `Each script can have at most one Component`
- `Enum is not defined`

## 已修复问题（已推送到Git）

✅ **版本不匹配**: 添加 `version: "3.8.0"` 到项目配置  
✅ **模块格式**: 改为 `"moduleFormat": "cjs"`  
✅ **Enum导入**: FlashlightSystem.ts 导入 Enum  
✅ **多组件错误**: EntityComponent 移到单独文件  
✅ **场景组件路径**: 更新为完整模块路径  
✅ **JSON语法**: 修复 Game.scene 重复闭合括号

## 清理缓存（关键步骤）

如果仍有错误，请执行以下步骤：

### 步骤1：关闭 Cocos Creator

完全关闭编辑器。

### 步骤2：删除缓存文件夹

在项目文件夹中删除以下文件夹：

```bash
# Windows
rmdir /s /q library
rmdir /s /q temp
rmdir /s /q local

# 或使用文件资源管理器手动删除
# - library/
# - temp/
# - local/
```

### 步骤3：重新打开项目

1. 打开 Cocos Creator 3.8.8
2. 选择项目文件夹
3. 等待资源导入完成

### 步骤4：验证

- [ ] 控制台没有红色错误
- [ ] 可以打开 `Game.scene`
- [ ] 点击预览可以运行

## 备选方案：重新创建场景

如果场景文件仍然有问题：

1. **新建场景**: Ctrl + N
2. **保存为** `GameNew.scene`
3. **添加节点**:
   - Canvas (自动创建)
   - Camera
   - GridSystem (添加 GridSystem.ts 组件)
   - EntityContainer (空节点)
   - GameController (添加 GameController.ts 组件)
4. **配置组件引用**: 将节点拖拽到组件属性中

## 文件说明

| 文件 | 状态 | 说明 |
|------|------|------|
| `Game.scene` | ⚠️ 可能需清理缓存 | 完整游戏场景 |
| `GameSimple.scene` | ✅ 应该正常 | 简化场景（无自定义组件） |
| `Boot.scene` | ✅ 应该正常 | 启动场景 |
| `Home.scene` | ✅ 应该正常 | 主菜单场景 |

## 如果还有问题

请提供以下信息：
1. 完整的错误日志（截图或复制）
2. Cocos Creator 确切版本号
3. 操作步骤

## 联系方式

如有问题，请反馈具体错误信息。