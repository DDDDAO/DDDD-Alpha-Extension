/**
 * 时间相关工具函数
 * 统一的延迟、随机延迟和动画帧等待逻辑
 */

/**
 * 延迟指定毫秒数
 * @param milliseconds - 延迟的毫秒数
 * @returns Promise，在指定时间后resolve
 */
export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * 随机延迟（在指定范围内）
 * @param min - 最小延迟毫秒数
 * @param max - 最大延迟毫秒数
 * @returns Promise，在随机时间后resolve
 */
export function waitRandomDelay(min = 500, max = 1_000): Promise<void> {
  const duration = randomIntInRange(min, max);
  return delay(duration);
}

/**
 * 等待下一个动画帧
 * @returns Promise，在下一个动画帧时resolve
 */
export function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * 生成指定范围内的随机整数
 * @param min - 最小值（包含）
 * @param max - 最大值（包含）
 * @returns 随机整数
 */
export function randomIntInRange(min: number, max: number): number {
  const clampedMin = Math.ceil(min);
  const clampedMax = Math.floor(max);
  return Math.floor(Math.random() * (clampedMax - clampedMin + 1)) + clampedMin;
}
