/**
 * 警告管理器
 * 负责显示各种警告提示和播放提示音
 */

import { postRuntimeMessage } from '../../lib/messages.js';

// 警告元素ID
const PENDING_ORDER_WARNING_ELEMENT_ID = 'dddd-alpha-pending-order-warning';
const URGENT_SELL_ALERT_ELEMENT_ID = 'dddd-alpha-urgent-sell-alert';

/**
 * 警告管理器类
 */
export class AlertManager {
  /**
   * 播放普通提示音 - 柔和的铃声
   */
  private playNormalWarningSound(): void {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextClass();

      const playBeep = (frequency: number, when: number, duration: number, volume: number) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;

        const now = when;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
        gainNode.gain.linearRampToValueAtTime(volume, now + duration - 0.01);
        gainNode.gain.linearRampToValueAtTime(0, now + duration);

        oscillator.start(now);
        oscillator.stop(now + duration);
      };

      const currentTime = audioContext.currentTime;
      playBeep(800, currentTime + 0.05, 0.15, 0.3);
      playBeep(1000, currentTime + 0.25, 0.2, 0.35);
    } catch (error) {
      console.error('[dddd-alpha-extension] Failed to play normal warning sound:', error);
    }
  }

  /**
   * 播放紧急警报声 - 刺耳的警报音
   */
  private playUrgentAlertSound(): void {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextClass();

      const playAlarmBeep = (frequency: number, when: number, duration: number, volume: number) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'square';
        oscillator.frequency.value = frequency;

        const now = when;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
        gainNode.gain.linearRampToValueAtTime(volume, now + duration - 0.01);
        gainNode.gain.linearRampToValueAtTime(0, now + duration);

        oscillator.start(now);
        oscillator.stop(now + duration);
      };

      const currentTime = audioContext.currentTime;
      playAlarmBeep(1200, currentTime + 0.05, 0.2, 0.6);
      playAlarmBeep(1400, currentTime + 0.3, 0.2, 0.6);
      playAlarmBeep(1600, currentTime + 0.55, 0.3, 0.7);

      playAlarmBeep(1200, currentTime + 1.0, 0.2, 0.6);
      playAlarmBeep(1400, currentTime + 1.25, 0.2, 0.6);
      playAlarmBeep(1600, currentTime + 1.5, 0.3, 0.7);
    } catch (error) {
      console.error('[dddd-alpha-extension] Failed to play urgent alert sound:', error);
    }
  }

  /**
   * 显示普通挂单警告 - 右上角黄色提示
   * @param side - 买入或卖出
   */
  showPendingOrderWarning(side: 'buy' | 'sell'): void {
    const body = document.body;
    if (!body) {
      return;
    }

    this.playNormalWarningSound();

    const existing = document.getElementById(PENDING_ORDER_WARNING_ELEMENT_ID);
    if (existing) {
      existing.remove();
    }

    const container = document.createElement('div');
    container.id = PENDING_ORDER_WARNING_ELEMENT_ID;
    container.style.position = 'fixed';
    container.style.top = '24px';
    container.style.right = '24px';
    container.style.zIndex = '2147483647';
    container.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
    container.style.color = '#ffffff';
    container.style.padding = '20px 24px';
    container.style.borderRadius = '12px';
    container.style.boxShadow =
      '0 10px 30px rgba(245, 158, 11, 0.4), 0 0 0 2px rgba(245, 158, 11, 0.2)';
    container.style.maxWidth = '360px';
    container.style.fontFamily =
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif';

    const icon = document.createElement('div');
    icon.textContent = '⚠️';
    icon.style.fontSize = '32px';
    icon.style.textAlign = 'center';
    icon.style.marginBottom = '12px';

    const title = document.createElement('div');
    const sideText = side === 'buy' ? '买入' : '卖出';
    title.textContent = `${sideText}限价单超过 5 秒未成交`;
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    title.style.marginBottom = '8px';
    title.style.textAlign = 'center';

    const description = document.createElement('div');
    description.textContent = '请注意订单状态，必要时手动处理';
    description.style.fontSize = '14px';
    description.style.lineHeight = '1.5';
    description.style.marginBottom = '16px';
    description.style.textAlign = 'center';
    description.style.opacity = '0.95';

    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.textContent = '我知道了';
    actionButton.style.width = '100%';
    actionButton.style.background = '#ffffff';
    actionButton.style.color = '#d97706';
    actionButton.style.border = 'none';
    actionButton.style.borderRadius = '8px';
    actionButton.style.padding = '12px 16px';
    actionButton.style.fontSize = '14px';
    actionButton.style.fontWeight = '600';
    actionButton.style.cursor = 'pointer';
    actionButton.style.transition = 'all 0.2s';

    actionButton.addEventListener('mouseenter', () => {
      actionButton.style.background = '#fffbeb';
      actionButton.style.transform = 'translateY(-1px)';
    });

    actionButton.addEventListener('mouseleave', () => {
      actionButton.style.background = '#ffffff';
      actionButton.style.transform = 'translateY(0)';
    });

    const dismiss = () => {
      if (container.parentElement) {
        container.parentElement.removeChild(container);
      }
    };

    actionButton.addEventListener('click', dismiss);

    container.appendChild(icon);
    container.appendChild(title);
    container.appendChild(description);
    container.appendChild(actionButton);

    body.appendChild(container);
  }

  /**
   * 显示紧急卖出警告 - 策略已暂停
   */
  showUrgentSellAlert(): void {
    const body = document.body;
    if (!body) {
      return;
    }

    this.playUrgentAlertSound();

    postRuntimeMessage({ type: 'FOCUS_WINDOW' }).catch(() => {
      console.warn('[dddd-alpha-extension] Failed to focus window');
    });

    const existing = document.getElementById(URGENT_SELL_ALERT_ELEMENT_ID);
    if (existing) {
      existing.remove();
    }

    const container = document.createElement('div');
    container.id = URGENT_SELL_ALERT_ELEMENT_ID;
    container.style.position = 'fixed';
    container.style.top = '50%';
    container.style.left = '50%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.zIndex = '2147483647';
    container.style.background = 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)';
    container.style.color = '#ffffff';
    container.style.padding = '32px';
    container.style.borderRadius = '16px';
    container.style.boxShadow =
      '0 20px 60px rgba(220, 38, 38, 0.6), 0 0 0 4px rgba(220, 38, 38, 0.3)';
    container.style.maxWidth = '480px';
    container.style.minWidth = '400px';
    container.style.fontFamily =
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif';
    container.style.animation = 'pulse 1.5s ease-in-out infinite';
    container.style.border = '3px solid #fff';

    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { box-shadow: 0 20px 60px rgba(220, 38, 38, 0.6), 0 0 0 4px rgba(220, 38, 38, 0.3); }
        50% { box-shadow: 0 20px 60px rgba(220, 38, 38, 0.9), 0 0 0 8px rgba(220, 38, 38, 0.5); }
      }
    `;
    document.head.appendChild(style);

    const icon = document.createElement('div');
    icon.textContent = '🚨';
    icon.style.fontSize = '48px';
    icon.style.textAlign = 'center';
    icon.style.marginBottom = '16px';

    const title = document.createElement('div');
    title.textContent = '⚠️ 紧急警告：策略已暂停';
    title.style.fontSize = '24px';
    title.style.fontWeight = '700';
    title.style.marginBottom = '16px';
    title.style.textAlign = 'center';
    title.style.textShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';

    const description = document.createElement('div');
    description.textContent = '卖出限价单超过 10 秒仍未成交！';
    description.style.fontSize = '18px';
    description.style.lineHeight = '1.6';
    description.style.marginBottom = '12px';
    description.style.textAlign = 'center';
    description.style.fontWeight = '600';

    const warning = document.createElement('div');
    warning.textContent = '自动化策略已紧急暂停，请立即检查订单并手动处理！';
    warning.style.fontSize = '16px';
    warning.style.lineHeight = '1.6';
    warning.style.marginBottom = '24px';
    warning.style.textAlign = 'center';
    warning.style.opacity = '0.95';

    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.textContent = '我已知晓并处理';
    actionButton.style.width = '100%';
    actionButton.style.background = '#ffffff';
    actionButton.style.color = '#dc2626';
    actionButton.style.border = 'none';
    actionButton.style.borderRadius = '12px';
    actionButton.style.padding = '16px 24px';
    actionButton.style.fontSize = '16px';
    actionButton.style.fontWeight = '700';
    actionButton.style.cursor = 'pointer';
    actionButton.style.transition = 'all 0.2s';
    actionButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';

    actionButton.addEventListener('mouseenter', () => {
      actionButton.style.background = '#fef2f2';
      actionButton.style.transform = 'translateY(-2px)';
      actionButton.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.3)';
    });

    actionButton.addEventListener('mouseleave', () => {
      actionButton.style.background = '#ffffff';
      actionButton.style.transform = 'translateY(0)';
      actionButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
    });

    const dismiss = () => {
      if (container.parentElement) {
        container.parentElement.removeChild(container);
      }
    };

    actionButton.addEventListener('click', (event) => {
      event.stopPropagation();
      dismiss();
    });

    container.appendChild(icon);
    container.appendChild(title);
    container.appendChild(description);
    container.appendChild(warning);
    container.appendChild(actionButton);

    body.appendChild(container);

    window.setTimeout(dismiss, 30_000);
  }
}
