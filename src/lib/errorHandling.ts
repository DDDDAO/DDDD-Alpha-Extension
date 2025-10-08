/**
 * 错误处理工具函数
 * 统一的错误规范化和处理逻辑
 */

/**
 * 将任意错误类型规范化为字符串消息
 * @param error - 任意类型的错误对象
 * @returns 规范化的错误消息字符串
 */
export function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  try {
    return String(error);
  } catch {
    return 'Unknown error';
  }
}

/**
 * 规范化详细信息字符串
 * @param detail - 详细信息（可能是字符串、对象或undefined）
 * @returns 规范化的详细信息字符串或undefined
 */
export function normalizeDetail(detail: unknown): string | undefined {
  if (detail === undefined || detail === null) {
    return undefined;
  }

  if (typeof detail === 'string') {
    return detail;
  }

  if (detail && typeof detail === 'object') {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }

    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }

  return String(detail);
}

/**
 * 自定义错误类：自动化消息错误
 */
export class AutomationMessageError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AutomationMessageError';
  }
}

/**
 * 自定义错误类：Content Script不可用
 */
export class ContentScriptUnavailableError extends AutomationMessageError {
  constructor(message = 'Content script unavailable') {
    super(message, 'CONTENT_SCRIPT_UNAVAILABLE');
    this.name = 'ContentScriptUnavailableError';
  }
}

/**
 * 自定义错误类：标签页不可用
 */
export class TabUnavailableError extends AutomationMessageError {
  constructor(message = 'Tab unavailable') {
    super(message, 'TAB_UNAVAILABLE');
    this.name = 'TabUnavailableError';
  }
}
