/**
 * 延迟工具函数
 */

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function randomDelay(min: number, max: number): Promise<void> {
  const duration = randomInt(min, max);
  return delay(duration);
}

export function randomInt(min: number, max: number): number {
  const clampedMin = Math.ceil(min);
  const clampedMax = Math.floor(max);
  return Math.floor(Math.random() * (clampedMax - clampedMin + 1)) + clampedMin;
}

export function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
