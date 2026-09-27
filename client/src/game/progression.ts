import { isLevelUnlocked as canStartLevel, MAX_LEVEL, nextUnlockedLevelAfterWin } from "@shared/levelProgress";
import type { TutorialScope } from "./onboarding";

type ReadValue = (key: string) => string | null;
type WriteValue = (key: string, value: string) => void;

export function levelProgressKey(scope: TutorialScope): string {
  return `last-relic-level-progress-v1:${scope}`;
}

export function readHighestUnlockedLevel(scope: TutorialScope, readValue: ReadValue): number {
  const stored = Number(readValue(levelProgressKey(scope)) ?? 1);
  return Number.isFinite(stored) ? Math.max(1, Math.min(MAX_LEVEL, Math.floor(stored))) : 1;
}

export function isLevelUnlocked(level: number, highestUnlocked: number): boolean {
  return canStartLevel(level, highestUnlocked);
}

export function recordLevelWin(scope: TutorialScope, completedLevel: number, readValue: ReadValue, writeValue: WriteValue): number {
  const currentUnlocked = readHighestUnlockedLevel(scope, readValue);
  if (!Number.isInteger(completedLevel) || !canStartLevel(completedLevel, currentUnlocked)) return currentUnlocked;
  const completed = Math.max(1, Math.min(MAX_LEVEL, completedLevel));
  const unlocked = nextUnlockedLevelAfterWin(completed, currentUnlocked);
  writeValue(levelProgressKey(scope), String(unlocked));
  return unlocked;
}
