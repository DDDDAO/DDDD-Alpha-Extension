/**
 * DOM控制器
 * 负责所有DOM查询、元素提取和页面信息获取
 */

import { SELECTORS } from '../../config/selectors.js';
import { parseNumericValue } from '../../lib/validators.js';
import type { TradeHistorySample } from '../automation/vwapCalculator.js';

/**
 * DOM控制器类
 * 封装所有与页面DOM交互的逻辑
 */
export class DOMController {
  /**
   * 获取页面语言设置
   * @returns 'en' 或 'zh-CN'
   */
  getPageLocale(): 'en' | 'zh-CN' {
    const href = window.location.href;
    if (href.includes('/zh-CN/')) {
      return 'zh-CN';
    }
    return 'en';
  }

  /**
   * 查找交易历史面板
   * @returns 交易历史面板元素或null
   */
  findTradeHistoryPanel(): HTMLElement | null {
    const isTradeHistoryContainer = (candidate: Element | null): candidate is HTMLElement => {
      if (!(candidate instanceof HTMLElement)) {
        return false;
      }

      const divNodes = candidate.querySelectorAll('div');
      for (const node of Array.from(divNodes)) {
        const content = node.textContent?.trim();
        if (!content) continue;

        const normalized = content.replace(/\s+/g, ' ').toLowerCase();
        const matchesChinese = normalized.includes('成交记录') && normalized.includes('限价');
        const matchesEnglish = normalized.includes('trade history') && normalized.includes('limit');
        if (matchesChinese || matchesEnglish) {
          return true;
        }
      }

      return false;
    };

    if (SELECTORS.tradeHistoryPanel) {
      const node = document.querySelector(SELECTORS.tradeHistoryPanel);
      if (node instanceof HTMLElement) {
        return node;
      }
    }

    const modernGridSelectors = [
      '.ReactVirtualized__Grid.ReactVirtualized__List',
      '.ReactVirtualized__Grid',
    ];

    for (const selector of modernGridSelectors) {
      const grids = Array.from(document.querySelectorAll(selector));
      for (const grid of grids) {
        if (!(grid instanceof HTMLElement)) continue;

        const containerCandidates: Array<Element | null> = [
          grid.closest('.flexlayout__tab'),
          grid.closest('.flexlayout__tab_moveable'),
          grid.parentElement?.parentElement ?? null,
          grid.parentElement,
        ];

        for (const candidate of containerCandidates) {
          if (isTradeHistoryContainer(candidate)) {
            return candidate;
          }
        }
      }
    }

    const fallbackPanel = document.querySelector('.order-4');
    if (fallbackPanel instanceof HTMLElement) {
      return fallbackPanel;
    }

    const grids = Array.from(document.querySelectorAll('.ReactVirtualized__Grid'));
    for (const grid of grids) {
      const host = grid.closest('[class*="order-4"]');
      if (host instanceof HTMLElement) {
        return host;
      }
    }

    return null;
  }

  /**
   * 从面板中提取交易历史样本
   * @param panel - 交易历史面板
   * @param limit - 最大提取数量，默认60
   * @returns 交易历史样本数组
   */
  extractTradeHistorySamples(panel: HTMLElement, limit = 60): TradeHistorySample[] {
    const grid = panel.querySelector('.ReactVirtualized__Grid');
    if (!grid) {
      return [];
    }

    const rowSelector = SELECTORS.tradeHistoryRow ?? '[role="gridcell"]';
    const rowNodes = Array.from(grid.querySelectorAll(rowSelector)).slice(0, limit);

    const entries: TradeHistorySample[] = [];
    for (const node of rowNodes) {
      if (!(node instanceof HTMLElement)) continue;

      const columns = Array.from(node.querySelectorAll('div'));
      if (columns.length < 3) continue;

      const time = columns[0].textContent?.trim() ?? '';
      const priceText = columns[1].textContent ?? '';
      const quantityText = columns[2].textContent ?? '';

      const price = parseNumericValue(priceText);
      const quantity = parseNumericValue(quantityText);

      if (price === null || quantity === null) continue;

      entries.push({ time, price, quantity });
    }

    return entries;
  }

  /**
   * 提取代币符号
   * @returns 代币符号或null
   */
  extractTokenSymbol(): string | null {
    const selector = SELECTORS.tokenSymbol;
    if (selector) {
      const node = document.querySelector(selector);
      const text = node?.textContent?.trim();
      if (text) {
        return text;
      }
    }

    const orderHeader = document.querySelector('.order-1');
    if (orderHeader instanceof HTMLElement) {
      const primaryCandidate = orderHeader.querySelector(
        'div.text-\\[20px\\].font-\\[600\\].leading-\\[24px\\].text-PrimaryText',
      );
      const text = primaryCandidate?.textContent?.trim();
      if (text) {
        return text;
      }

      const fallbackNodes = Array.from(orderHeader.querySelectorAll<HTMLElement>('div'));
      for (const candidate of fallbackNodes) {
        const className = typeof candidate.className === 'string' ? candidate.className : '';
        if (className.includes('text-[20px]') && className.includes('font-[600]')) {
          const candidateText = candidate.textContent?.trim();
          if (candidateText) {
            return candidateText;
          }
        }
      }
    }

    return null;
  }

  /**
   * 获取交易表单面板
   * @returns 交易表单面板元素或null
   */
  getTradingFormPanel(): HTMLElement | null {
    const isValidTradingPanel = (candidate: Element | null): candidate is HTMLElement => {
      if (!(candidate instanceof HTMLElement)) {
        return false;
      }

      const hasLimitPriceInput = Boolean(candidate.querySelector('#limitPrice'));
      const hasBuyButton = Boolean(candidate.querySelector('button.bn-button__buy'));

      return hasLimitPriceInput && hasBuyButton;
    };

    const resolveFromNode = (node: Element | null): HTMLElement | null => {
      let current: Element | null = node;

      while (current && current !== document.body) {
        if (isValidTradingPanel(current)) {
          return current;
        }

        if (current instanceof HTMLElement) {
          const flexAncestor = current.closest('.flexlayout__tab, .flexlayout__tab_moveable');
          if (isValidTradingPanel(flexAncestor)) {
            return flexAncestor;
          }
        }

        current = current.parentElement;
      }

      return null;
    };

    if (SELECTORS.tradingFormPanel) {
      const preferred = document.querySelector(SELECTORS.tradingFormPanel);
      if (isValidTradingPanel(preferred)) {
        return preferred;
      }
    }

    const keySelectors = ['#limitPrice', '#limitSize', '#limitTotal', 'button.bn-button__buy'];

    for (const keySelector of keySelectors) {
      const node = document.querySelector(keySelector);
      const panel = resolveFromNode(node);
      if (panel) {
        return panel;
      }
    }

    const fallback = document.querySelector('.order-5');
    if (isValidTradingPanel(fallback)) {
      return fallback;
    }

    return fallback instanceof HTMLElement ? fallback : null;
  }

  /**
   * 获取未结订单根元素
   * @returns 未结订单根元素或null
   */
  getOpenOrdersRoot(): HTMLElement | null {
    const node = document.querySelector('.trd-order');
    return node instanceof HTMLElement ? node : null;
  }

  /**
   * 根据标签文本查找Tab元素
   * @param root - 根元素
   * @param label - 标签文本
   * @returns Tab元素或null
   */
  getTabByLabel(root: HTMLElement, label: string): HTMLElement | null {
    const normalizedLabel = label.trim().toLowerCase();
    const tabs = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
    return (
      tabs.find((tab) => {
        const text = tab.textContent?.trim().toLowerCase();
        if (!text) return false;
        return text === normalizedLabel || text.startsWith(normalizedLabel);
      }) ?? null
    );
  }

  /**
   * 获取限价订单容器
   * @param root - 根元素
   * @returns 限价订单容器或null
   */
  getLimitOrdersContainer(root: HTMLElement): HTMLElement | null {
    const tables = root.querySelectorAll('table tbody');
    if (tables.length > 0) {
      for (const tbody of Array.from(tables)) {
        const rows = tbody.querySelectorAll('tr');
        if (rows.length > 0) {
          const hasContent = Array.from(rows).some((row) => {
            const text = row.textContent?.trim();
            return text && text.length > 0;
          });
          if (hasContent) {
            let container = tbody.parentElement;
            if (container) {
              container = container.parentElement;
            }
            return (
              container instanceof HTMLElement ? container : tbody.parentElement
            ) as HTMLElement;
          }
        }
      }
    }

    const candidates = Array.from(root.querySelectorAll<HTMLElement>('div'));
    for (const candidate of candidates) {
      const className = candidate.className ?? '';
      if (
        className.includes('pb-[108px]') &&
        className.includes('flex-col') &&
        className.includes('overflow-auto')
      ) {
        return candidate;
      }
    }

    const rowCandidates = root.querySelectorAll('[data-row-index],[role="row"]');
    if (rowCandidates.length > 0) {
      let parent = rowCandidates[0].parentElement;
      while (parent && parent !== root) {
        if (parent instanceof HTMLElement && parent.classList.contains('overflow-auto')) {
          return parent;
        }
        parent = parent.parentElement;
      }
    }

    for (const candidate of candidates) {
      const className = candidate.className ?? '';
      if (className.includes('flex-col') && className.includes('overflow')) {
        const hasOrderContent = candidate.querySelector('[role="row"],[data-row-index]');
        if (hasOrderContent) {
          return candidate;
        }
      }
    }

    return null;
  }

  /**
   * 查找包含精确文本的元素
   * @param root - 根元素
   * @param text - 要查找的文本
   * @returns 元素或null
   */
  findElementWithExactText(root: ParentNode, text: string): HTMLElement | null {
    const target = text.trim();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!(node instanceof HTMLElement)) continue;

      if (node.textContent?.trim() === target) {
        return node;
      }
    }

    return null;
  }

  /**
   * 查找订单面板Tab
   * @param orderPanel - 订单面板
   * @param selector - 选择器
   * @returns Tab元素或null
   */
  findOrderPanelTab(orderPanel: HTMLElement, selector: string): HTMLElement | null {
    const scoped = orderPanel.querySelector<HTMLElement>(selector);
    if (scoped) {
      return scoped;
    }

    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
    for (const candidate of candidates) {
      if (orderPanel.contains(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * 检查是否有登录提示
   * @returns 是否需要登录
   */
  checkForLoginPrompt(): boolean {
    if (!SELECTORS.loginPrompt) {
      return false;
    }

    const loginNode = document.querySelector(SELECTORS.loginPrompt);
    if (!loginNode) {
      return false;
    }

    const text = loginNode.textContent?.trim() ?? '';
    return text.length > 0;
  }

  /**
   * 查找订单确认按钮
   * @returns 确认按钮或null
   */
  findOrderConfirmationButton(): HTMLButtonElement | null {
    const candidates = new Set<HTMLButtonElement>();
    for (const button of Array.from(
      document.querySelectorAll<HTMLButtonElement>('dialog button, div[role="dialog"] button'),
    )) {
      candidates.add(button);
    }

    const fallback = document.querySelector<HTMLButtonElement>(
      '#__APP > div:nth-of-type(3) > div > div > button',
    );
    if (fallback) {
      candidates.add(fallback);
    }

    for (const candidate of candidates) {
      const text = candidate.textContent?.trim().toLowerCase();
      const locale = this.getPageLocale();
      const confirmLabel = (locale === 'zh-CN' ? '确认' : 'Confirm').toLowerCase();
      if (text === confirmLabel) {
        return candidate;
      }
    }

    return null;
  }
}
