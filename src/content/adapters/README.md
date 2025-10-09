# Content Script - 适配器层

## 目录结构

```
adapters/
├── dom/                    # DOM 适配器
│   ├── selectors.adapter.ts
│   ├── form.adapter.ts
│   └── panel.adapter.ts
│
└── ui/                     # UI 适配器
    ├── alert-renderer.ts
    └── sound-player.ts
```

## 职责

适配器层封装对外部系统（DOM、浏览器 API）的访问，隔离变化。

### DOM 适配器
- 选择器管理
- 元素查找
- 表单操作

### UI 适配器
- 告警渲染
- 音频播放
- 视觉效果

## 设计原则

### 1. 封装变化
DOM 结构变化时，只需修改适配器层，领域层不受影响。

### 2. 提供稳定接口
适配器提供稳定的接口给领域层和服务层使用。

### 3. 错误处理
适配器层统一处理 DOM 相关错误。

## 示例

```typescript
export class SelectorsAdapter {
  /**
   * 提取 Token 符号
   */
  extractTokenSymbol(): string | null {
    // 封装复杂的 DOM 查找逻辑
    // 页面结构变化时只需修改这里
  }

  /**
   * 查找交易历史面板
   */
  findTradeHistoryPanel(): HTMLElement | null {
    // ...
  }
}
```
