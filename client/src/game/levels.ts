import type { Cell } from "./algorithms";
import { MAX_LEVEL } from "@shared/levelProgress";
export { MAX_LEVEL };

export type MansionLevel = {
  number: number;
  chapter: number;
  chapterName: string;
  map: string[];
  ghostCadence: number;
};

// Ten authored, reachable room graphs. Each has exactly one start, ghost, key,
// gate, three relics, and exit; each map appears as five spatial remixes.
const MAP_TEMPLATES: string[][] = [
  ["###########", "#S..#....E#", "#...#.#...#", "#.#...#...#", "#...K.D...#", "#.#.#.#.###", "#A..#..B..#", "#G..#...C.#", "###########"],
  ["###########", "#S...#....#", "#.#..#.#..#", "#.#K.#.#E.#", "#...D.....#", "#.###.#.###", "#A...#..B.#", "#G......C.#", "###########"],
  ["###########", "#S..#....E#", "#.#.#.##..#", "#.#...#...#", "#K..D.A...#", "#.###.#.#.#", "#B...#...C#", "#G........#", "###########"],
  ["###########", "#S...#...E#", "#.##.#.#..#", "#....#.#..#", "#K.D....A.#", "#.#.####..#", "#B....#...#", "#G..C.....#", "###########"],
  ["###########", "#S.#.....E#", "#..#..##..#", "#.##..#...#", "#K...D..A.#", "#.#.#.#.###", "#B.#....C.#", "#G........#", "###########"],
  ["###########", "#S....#..E#", "#.###.#.#.#", "#...#...#.#", "#K.D...A..#", "#.#.###.#.#", "#B...#...C#", "#G........#", "###########"],
  ["###########", "#S.#.....E#", "#..#.#.#..#", "#..#...#..#", "#K.D..A...#", "#.#.##.#..#", "#B..#...C.#", "#G........#", "###########"],
  ["###########", "#S..#.....#", "#.#.#.###.#", "#.#...#...#", "#K.D..#A.E#", "###.###.#.#", "#B...#...C#", "#G........#", "###########"],
  ["###########", "#S....#..E#", "###.#.#.###", "#...#...#.#", "#K.D....A.#", "#.#.##.#..#", "#B...#...C#", "#G........#", "###########"],
  ["###########", "#S.#.....E#", "#..#.#.#..#", "#....#....#", "#K.D.#.A..#", "#.###.#.###", "#B....#..C#", "#G........#", "###########"],
];

const CHAPTERS = [
  "Mourningwood Estate",
  "Moonlit Gallery",
  "Clockwork Wing",
  "Glass Conservatory",
  "The Wraith's Keep",
] as const;

const clampLevel = (level: number) => Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));

export function getLevelMap(level: number): string[] {
  const safeLevel = clampLevel(level);
  const zeroBased = safeLevel - 1;
  const chapter = Math.floor(zeroBased / 10);
  const chapterMap = Math.floor((zeroBased % 10) / 5);
  const template = MAP_TEMPLATES[chapter * 2 + chapterMap] ?? MAP_TEMPLATES[0];
  const remix = zeroBased % 5;
  const mirrorX = remix === 1 || remix === 3 || remix === 4;
  const mirrorY = remix === 2 || remix === 3;
  const swapStartsAndRelics = remix === 4;
  const swaps: Record<string, string> = swapStartsAndRelics
    ? { S: "G", G: "S", A: "C", C: "A" }
    : {};

  const rows = mirrorY ? [...template].reverse() : [...template];
  return rows.map((row) => {
    const cells = row.split("");
    if (mirrorX) cells.reverse();
    return cells.map((cell) => swaps[cell] ?? cell).join("");
  });
}

export function getLevelInfo(level: number): MansionLevel {
  const number = clampLevel(level);
  const chapter = Math.floor((number - 1) / 10) + 1;
  const map = getLevelMap(number);
  const ghostCadence = number <= 10 ? 4 : number <= 20 ? 3 : number <= 30 ? 3 : 2;
  return {
    number,
    chapter,
    chapterName: CHAPTERS[chapter - 1] ?? CHAPTERS[0],
    map,
    ghostCadence,
  };
}

export function levelMapMarkers(map: string[]) {
  const markers = new Map<string, Cell>();
  map.forEach((row, y) => {
    row.split("").forEach((marker, x) => {
      if ("SGKDABCE".includes(marker)) markers.set(marker, { x, y });
    });
  });
  return markers;
}
