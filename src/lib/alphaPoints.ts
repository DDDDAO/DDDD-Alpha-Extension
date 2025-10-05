export interface AlphaPointStats {
  points: number;
  nextThresholdDelta: number;
}

export function calculateAlphaPointStats(volume: number): AlphaPointStats {
  if (!Number.isFinite(volume) || volume <= 0) {
    return { points: 0, nextThresholdDelta: 2 };
  }

  if (volume < 2) {
    return { points: 0, nextThresholdDelta: 2 - volume };
  }

  const rawPoints = Math.floor(Math.log2(volume));
  const points = rawPoints > 0 ? rawPoints : 0;
  const nextThreshold = 2 ** (points + 1);
  const delta = Math.max(0, nextThreshold - volume);

  return {
    points,
    nextThresholdDelta: delta,
  };
}
