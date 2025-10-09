# 单元测试

## 目录结构

```
unit/
├── domains/        # 领域模块测试
│   ├── order/      # 订单领域测试
│   ├── price/      # 价格领域测试
│   ├── balance/    # 余额领域测试
│   └── history/    # 历史记录领域测试
├── services/       # 服务层测试
├── adapters/       # 适配器层测试
└── utils/          # 工具函数测试
```

## 测试规范

### 文件命名
- 测试文件命名：`*.test.ts`
- 测试文件应与源文件同名，例如：
  - 源文件：`vwap-calculator.ts`
  - 测试文件：`vwap-calculator.test.ts`

### 测试结构
```typescript
import { describe, it, expect } from 'vitest';
import { functionToTest } from '@/path/to/module';

describe('ModuleName', () => {
  describe('functionName', () => {
    it('should handle normal case', () => {
      // Arrange
      const input = ...;

      // Act
      const result = functionToTest(input);

      // Assert
      expect(result).toBe(expected);
    });

    it('should handle edge case', () => {
      // ...
    });

    it('should handle error case', () => {
      // ...
    });
  });
});
```

### 测试覆盖率目标
- 单元测试覆盖率：**> 90%**
- 领域模块：**> 95%**
- 服务层：**> 85%**
- 工具函数：**> 95%**

## 运行测试

```bash
# 运行所有测试
npm test

# 运行单元测试
npm test -- unit

# 运行特定文件
npm test -- vwap-calculator.test.ts

# 生成覆盖率报告
npm test -- --coverage
```
