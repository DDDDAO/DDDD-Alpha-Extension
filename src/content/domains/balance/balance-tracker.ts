/**
 * 余额追踪器
 */

import type { BalanceExtractResult } from '@types';

export class BalanceTracker {
  parseNumeric(raw: string): number | null {
    const sanitized = raw.replace(/[,\s]/g, '');
    if (!sanitized) return null;

    const match = sanitized.match(/^(-?\d+(?:\.\d+)?)([KMB]?)$/i);
    if (!match) return null;

    let value = Number(match[1]);
    if (!Number.isFinite(value)) return null;

    const suffix = match[2]?.toUpperCase() ?? '';
    switch (suffix) {
      case 'K':
        value *= 1_000;
        break;
      case 'M':
        value *= 1_000_000;
        break;
      case 'B':
        value *= 1_000_000_000;
        break;
    }

    return value;
  }

  extractBalance(container: HTMLElement, labelText: string): BalanceExtractResult {
    const label = this.findElementWithText(container, labelText);
    if (!label) {
      return { balance: null, error: 'Label not found' };
    }

    let sibling = label.nextElementSibling as HTMLElement | null;
    while (sibling) {
      const text = sibling.textContent?.trim();
      if (text) {
        const normalized = text.replace(/[^0-9.,-]/g, '');
        if (normalized) {
          const value = this.parseNumeric(normalized);
          if (value !== null) {
            return { balance: value };
          }
        }
      }
      sibling = sibling.nextElementSibling as HTMLElement | null;
    }

    return { balance: null, error: 'Balance value not found' };
  }

  private findElementWithText(root: ParentNode, text: string): HTMLElement | null {
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
}
