import { describe, expect, it } from "vitest";
import { depthFirstScan } from "../client/src/game/algorithms";
import { getLevelInfo, getLevelMap, levelMapMarkers, MAX_LEVEL } from "../client/src/game/levels";
import { isLevelUnlocked, levelProgressKey, readHighestUnlockedLevel, recordLevelWin } from "../client/src/game/progression";
import type { TutorialScope } from "../client/src/game/onboarding";

const markerKeys = ["S", "G", "K", "D", "A", "B", "C", "E"];

describe("50-level mansion progression", () => {
  it("provides 50 playable layouts with reachable key, relics, and exit", () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const map = getLevelMap(level);
      expect(map, `level ${level} height`).toHaveLength(9);
      expect(map.every((row) => row.length === 11), `level ${level} width`).toBe(true);
      const counts = new Map<string, number>();
      for (const row of map) {
        for (const marker of row.split("")) {
          if (markerKeys.includes(marker)) counts.set(marker, (counts.get(marker) ?? 0) + 1);
        }
      }
      for (const marker of markerKeys) expect(counts.get(marker), `level ${level}: ${marker}`).toBe(1);

      const markers = levelMapMarkers(map);
      const canEnter = (cell: { x: number; y: number }, gateOpen: boolean) =>
        cell.x >= 0 && cell.y >= 0 && cell.x < 11 && cell.y < 9 &&
        map[cell.y][cell.x] !== "#" && (gateOpen || map[cell.y][cell.x] !== "D");
      const reached = (gateOpen: boolean) => depthFirstScan(
        markers.get("S")!,
        (cell) => canEnter(cell, gateOpen),
      ).order;
      const closedReachable = new Set(reached(false).map(({ x, y }) => `${x},${y}`));
      const openReachable = new Set(reached(true).map(({ x, y }) => `${x},${y}`));
      const key = markers.get("K")!;
      expect(closedReachable.has(`${key.x},${key.y}`), `level ${level} key`).toBe(true);
      for (const objective of ["A", "B", "C", "E"]) {
        const cell = markers.get(objective)!;
        expect(openReachable.has(`${cell.x},${cell.y}`), `level ${level} ${objective}`).toBe(true);
      }
    }
  });

  it("provides five ten-level chapters and gradually increases ghost pressure", () => {
    expect(getLevelInfo(1).chapterName).toBe("Mourningwood Estate");
    expect(getLevelInfo(50).chapterName).toBe("The Wraith's Keep");
    expect(getLevelInfo(1).ghostCadence).toBe(4);
    expect(getLevelInfo(15).ghostCadence).toBe(3);
    expect(getLevelInfo(35).ghostCadence).toBe(2);
  });

  it("keeps unlock progress scoped per guest/account and unlocks only the next stage", () => {
    const scope: TutorialScope = "account-17";
    const stored = new Map<string, string>();
    const read = (key: string) => stored.get(key) ?? null;
    const write = (key: string, value: string) => { stored.set(key, value); };
    expect(readHighestUnlockedLevel(scope, read)).toBe(1);
    expect(isLevelUnlocked(2, 1)).toBe(false);
    expect(recordLevelWin(scope, 50, read, write)).toBe(1);
    expect(recordLevelWin(scope, 1, read, write)).toBe(2);
    expect(readHighestUnlockedLevel(scope, read)).toBe(2);
    expect(readHighestUnlockedLevel("guest", read)).toBe(1);
    let unlocked = recordLevelWin(scope, 2, read, write);
    expect(unlocked).toBe(3);
    for (let completed = 3; completed < MAX_LEVEL; completed++) {
      unlocked = recordLevelWin(scope, completed, read, write);
    }
    expect(unlocked).toBe(MAX_LEVEL);
    expect(isLevelUnlocked(MAX_LEVEL, unlocked)).toBe(true);
    expect(stored.has(levelProgressKey(scope))).toBe(true);
  });
});
