/**
 * DOM 选择器适配器
 * 封装 DOM 查询逻辑，隔离页面结构变化
 */

import type { PageLocale } from '@types';
import { SELECTORS } from '../../../config/selectors';

export class SelectorsAdapter {
  getPageLocale(): PageLocale {
    const href = window.location.href;
    return href.includes('/zh-CN/') ? 'zh-CN' : 'en';
  }

  extractTokenSymbol(): string | null {
    const selector = SELECTORS.tokenSymbol;
    if (selector) {
      const node = document.querySelector(selector);
      const text = node?.textContent?.trim();
      if (text) return text;
    }

    const orderHeader = document.querySelector('.order-1');
    if (orderHeader instanceof HTMLElement) {
      const primaryCandidate = orderHeader.querySelector(
        'div.text-\\[20px\\].font-\\[600\\].leading-\\[24px\\].text-PrimaryText',
      );
      const text = primaryCandidate?.textContent?.trim();
      if (text) return text;

      const fallbackNodes = Array.from(orderHeader.querySelectorAll<HTMLElement>('div'));
      for (const candidate of fallbackNodes) {
        const className = typeof candidate.className === 'string' ? candidate.className : '';
        if (className.includes('text-[20px]') && className.includes('font-[600]')) {
          const candidateText = candidate.textContent?.trim();
          if (candidateText) return candidateText;
        }
      }
    }

    return null;
  }

  findTradeHistoryPanel(): HTMLElement | null {
    if (SELECTORS.tradeHistoryPanel) {
      const node = document.querySelector(SELECTORS.tradeHistoryPanel);
      if (node instanceof HTMLElement) return node;
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
          if (this.isTradeHistoryContainer(candidate)) {
            return candidate;
          }
        }
      }
    }

    return null;
  }

  findTradingFormPanel(): HTMLElement | null {
    if (SELECTORS.tradingFormPanel) {
      const preferred = document.querySelector(SELECTORS.tradingFormPanel);
      if (this.isValidTradingPanel(preferred)) {
        return preferred;
      }
    }

    const keySelectors = ['#limitPrice', '#limitSize', '#limitTotal', 'button.bn-button__buy'];

    for (const keySelector of keySelectors) {
      const node = document.querySelector(keySelector);
      const panel = this.resolveFromNode(node);
      if (panel) return panel;
    }

    const fallback = document.querySelector('.order-5');
    return fallback instanceof HTMLElement ? fallback : null;
  }

  findElementWithExactText(root: ParentNode, text: string): HTMLElement | null {
    const target = text.trim();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node instanceof HTMLElement && node.textContent?.trim() === target) {
        return node;
      }
    }
    return null;
  }

  private isTradeHistoryContainer(candidate: Element | null): candidate is HTMLElement {
    if (!(candidate instanceof HTMLElement)) return false;

    const divNodes = candidate.querySelectorAll('div');
    for (const node of Array.from(divNodes)) {
      const content = node.textContent?.trim();
      if (!content) continue;

      const normalized = content.replace(/\s+/g, ' ').toLowerCase();
      const matchesChinese = normalized.includes('成交记录') && normalized.includes('限价');
      const matchesEnglish = normalized.includes('trade history') && normalized.includes('limit');
      if (matchesChinese || matchesEnglish) return true;
    }

    return false;
  }

  private isValidTradingPanel(candidate: Element | null): candidate is HTMLElement {
    if (!(candidate instanceof HTMLElement)) return false;

    const hasLimitPriceInput = Boolean(candidate.querySelector('#limitPrice'));
    const hasBuyButton = Boolean(candidate.querySelector('button.bn-button__buy'));

    return hasLimitPriceInput && hasBuyButton;
  }

  private resolveFromNode(node: Element | null): HTMLElement | null {
    let current: Element | null = node;

    while (current && current !== document.body) {
      if (this.isValidTradingPanel(current)) {
        return current;
      }

      if (current instanceof HTMLElement) {
        const flexAncestor = current.closest('.flexlayout__tab, .flexlayout__tab_moveable');
        if (this.isValidTradingPanel(flexAncestor)) {
          return flexAncestor;
        }
      }

      current = current.parentElement;
    }

    return null;
  }
}
