/**
 * Token目录管理模块
 * 负责管理Token倍数映射和缓存
 */
import { TOKEN_DIRECTORY_STORAGE_KEY } from '../../config/storageKey.js';

const MULTIPLIER_CACHE_DURATION_MS = 5 * 60_000; // 5分钟缓存

/**
 * Token目录记录
 */
interface TokenDirectoryRecord {
  mulPoint?: number | string | null;
  alphaId?: string | null;
}

/**
 * Token目录容器
 */
interface TokenDirectoryContainer {
  directory?: Record<string, TokenDirectoryRecord>;
}

/**
 * Token目录管理器类
 */
export class TokenDirectoryManager {
  private cachedAlphaMultiplierMap: Record<string, number> | null = null;
  private cachedAlphaMultiplierTimestamp = 0;

  /**
   * 获取Alpha倍数映射
   */
  async getAlphaMultiplierMap(): Promise<Record<string, number>> {
    const now = Date.now();
    if (
      this.cachedAlphaMultiplierMap &&
      now - this.cachedAlphaMultiplierTimestamp < MULTIPLIER_CACHE_DURATION_MS
    ) {
      return this.cachedAlphaMultiplierMap;
    }

    const directory = await new Promise<Record<string, TokenDirectoryRecord> | null>((resolve) => {
      chrome.storage.local.get(TOKEN_DIRECTORY_STORAGE_KEY, (result) => {
        resolve(this.extractTokenDirectory(result[TOKEN_DIRECTORY_STORAGE_KEY]));
      });
    });

    const alphaMap: Record<string, number> = {};

    if (directory) {
      for (const entry of Object.values(directory)) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const alphaIdRaw = typeof entry.alphaId === 'string' ? entry.alphaId.trim() : '';
        if (alphaIdRaw.length === 0) {
          continue;
        }

        const multiplierRaw = entry.mulPoint;
        const multiplier =
          typeof multiplierRaw === 'number' ? multiplierRaw : Number(multiplierRaw ?? NaN);
        if (!Number.isFinite(multiplier) || multiplier <= 0) {
          continue;
        }

        alphaMap[alphaIdRaw.toUpperCase()] = multiplier;
      }
    }

    this.cachedAlphaMultiplierMap = alphaMap;
    this.cachedAlphaMultiplierTimestamp = now;
    return alphaMap;
  }

  /**
   * 查找Alpha倍数
   */
  lookupMultiplier(alphaMap: Record<string, number>, alphaId: string): number {
    if (alphaId.length === 0) {
      return 1;
    }

    const candidate = alphaMap[alphaId.toUpperCase()];
    if (!Number.isFinite(candidate) || candidate === undefined || candidate <= 0) {
      return 1;
    }

    return candidate;
  }

  /**
   * 使缓存失效
   */
  invalidateCache(): void {
    this.cachedAlphaMultiplierMap = null;
    this.cachedAlphaMultiplierTimestamp = 0;
  }

  /**
   * 提取Token目录
   */
  private extractTokenDirectory(value: unknown): Record<string, TokenDirectoryRecord> | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const container = value as TokenDirectoryContainer;
    const directoryCandidate = container.directory ?? value;

    if (!directoryCandidate || typeof directoryCandidate !== 'object') {
      return null;
    }

    return directoryCandidate as Record<string, TokenDirectoryRecord>;
  }
}
