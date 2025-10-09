/**
 * Vitest 测试环境设置文件
 */

import { afterEach, beforeEach, vi } from 'vitest';

// 模拟 Chrome Extension API
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    lastError: null,
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    sendMessage: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  windows: {
    getLastFocused: vi.fn(),
    getAll: vi.fn(),
    update: vi.fn(),
  },
} as any;

// 每个测试前后清理
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
