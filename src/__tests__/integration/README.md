# 集成测试

## 目录结构

```
integration/
├── domains/        # 领域模块集成测试
├── services/       # 服务层集成测试
└── workflows/      # 完整工作流测试
```

## 测试目标

集成测试验证多个模块之间的交互，确保它们能够正确协同工作。

### 测试场景

1. **Content Script 与 Background 通信**
   - 消息传递
   - 状态同步
   - 错误处理

2. **订单流程测试**
   - 价格计算 → 订单下单 → 监控
   - 完整的自动化流程
   - 错误恢复机制

3. **数据流测试**
   - 订单历史获取 → 数据合并 → 积分计算
   - 余额追踪流程
   - Token 目录更新

## 运行测试

```bash
# 运行集成测试
npm test -- integration

# 运行特定集成测试
npm test -- integration/workflows
```
