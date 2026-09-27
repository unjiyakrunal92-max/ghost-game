export const MAX_LEVEL = 50;

/** Only previously unlocked campaign stages can be started or recorded. */
export function isLevelUnlocked(level: number, highestUnlocked: number): boolean {
  return Number.isInteger(level) && level >= 1 && level <= MAX_LEVEL && level <= highestUnlocked;
}

/** A win unlocks exactly the next stage; a loss, replay, or out-of-order result cannot skip ahead. */
export function nextUnlockedLevelAfterWin(level: number, highestUnlocked: number): number {
  if (!isLevelUnlocked(level, highestUnlocked)) return Math.max(1, Math.min(MAX_LEVEL, highestUnlocked));
  return Math.min(MAX_LEVEL, Math.max(highestUnlocked, level + 1));
}
