/**
 * 稳定性数据获取器 - 测试实现
 * 从 alpha123.uk 获取币种稳定性数据
 */

export interface StabilityItem {
  n: string; // 币种名称 (如 "ALEO/USDT")
  p: number; // 当前价格
  st: string; // 稳定性状态 ("green:stable" | "yellow:moderate" | "red:unstable")
  md: number; // 4倍天数
  spr: number; // 价差基点
}

export interface StabilityFeed {
  lastUpdated: number; // Unix 时间戳
  items: StabilityItem[];
}

export interface StabilityRecommendation {
  symbol: string;
  price: number;
  stability: string;
  spread: number;
  days: number;
  score: number;
  reason: string;
}

export class StabilityFetcher {
  private static readonly FEED_URL = 'https://alpha123.uk/stability/stability_feed_v2.json';
  private static readonly UPDATE_INTERVAL = 8000; // 8秒，与页面保持一致

  /**
   * 获取最新的稳定性数据
   */
  static async fetchStabilityData(): Promise<StabilityFeed | null> {
    try {
      const response = await fetch(this.FEED_URL);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: StabilityFeed = await response.json();
      return data;
    } catch (error) {
      console.error('获取稳定性数据失败:', error);
      return null;
    }
  }

  /**
   * 解析稳定性状态
   */
  static parseStability(st: string): { color: string; label: string } {
    const [color, status] = st.split(':');
    const labels: Record<string, string> = {
      stable: '稳定',
      moderate: '一般',
      unstable: '不稳'
    };
    return {
      color,
      label: labels[status] || status
    };
  }

  /**
   * 计算币种推荐评分
   * 评分规则：
   * - 稳定性: 稳定=100分, 一般=50分, 不稳=0分
   * - 价差: 越低越好, 0-5分区间, 超过5按0分计
   * - 4倍天数: 5-15天为最佳, 得分50分; 偏离则递减
   */
  static calculateScore(item: StabilityItem): number {
    const { st, spr, md } = item;

    // 稳定性评分 (0-100)
    let stabilityScore = 0;
    if (st.includes('stable')) stabilityScore = 100;
    else if (st.includes('moderate')) stabilityScore = 50;
    else stabilityScore = 0;

    // 价差评分 (0-50): 价差越小越好
    const spreadScore = Math.max(0, 50 - spr * 10);

    // 4倍天数评分 (0-50): 5-15天为最佳
    let daysScore = 0;
    if (md >= 5 && md <= 15) {
      daysScore = 50;
    } else if (md < 5) {
      daysScore = md * 10; // 0-4天线性递增
    } else {
      daysScore = Math.max(0, 50 - (md - 15) * 3); // 超过15天递减
    }

    return stabilityScore + spreadScore + daysScore;
  }

  /**
   * 获取推荐的稳定币种
   * @param topN 返回前N个推荐
   */
  static async getRecommendations(topN = 3): Promise<StabilityRecommendation[]> {
    const data = await this.fetchStabilityData();
    if (!data) return [];

    const recommendations = data.items
      .map(item => {
        const score = this.calculateScore(item);
        const { label } = this.parseStability(item.st);

        // 生成推荐理由
        let reason = '';
        if (score >= 150) {
          reason = '稳定性优秀，价差极低，适合稳定套利';
        } else if (score >= 100) {
          reason = '稳定性良好，价差合理';
        } else if (score >= 50) {
          reason = '稳定性一般，谨慎操作';
        } else {
          reason = '波动较大，不建议操作';
        }

        return {
          symbol: item.n.replace('/USDT', ''),
          price: item.p,
          stability: label,
          spread: item.spr,
          days: item.md,
          score,
          reason
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    return recommendations;
  }

  /**
   * 开始监听数据更新
   */
  static startMonitoring(callback: (data: StabilityFeed) => void): number {
    const timer = window.setInterval(async () => {
      const data = await this.fetchStabilityData();
      if (data) {
        callback(data);
      }
    }, this.UPDATE_INTERVAL);

    // 立即执行一次
    this.fetchStabilityData().then(data => {
      if (data) callback(data);
    });

    return timer;
  }

  /**
   * 停止监听
   */
  static stopMonitoring(timerId: number): void {
    clearInterval(timerId);
  }
}
