import { describe, expect, it } from "vitest";
import { breadthFirstSearch, depthFirstScan, type Cell } from "../client/src/game/algorithms";

const cellKey = ({ x, y }: Cell) => `${x},${y}`;
const adjacent = (left: Cell, right: Cell) => Math.abs(left.x - right.x) + Math.abs(left.y - right.y) === 1;

describe("mansion graph algorithms", () => {
  const walkable = new Set([
    "0,0", "0,1", "0,2", "1,2", "2,2", "2,1", "2,0",
  ]);
  const canEnter = (cell: Cell) => walkable.has(cellKey(cell));

  it("BFS returns a legal shortest route around a blocked corridor", () => {
    const result = breadthFirstSearch({ x: 0, y: 0 }, { x: 2, y: 0 }, canEnter);

    expect(result.distance).toBe(6);
    expect(result.route).toHaveLength(7);
    expect(result.route[0]).toEqual({ x: 0, y: 0 });
    expect(result.route.at(-1)).toEqual({ x: 2, y: 0 });
    expect(result.route.every(canEnter)).toBe(true);
    expect(result.route.slice(1).every((cell, index) => adjacent(result.route[index], cell))).toBe(true);
  });

  it("BFS reports an unreachable goal", () => {
    const result = breadthFirstSearch({ x: 0, y: 0 }, { x: 4, y: 4 }, canEnter);
    expect(result.distance).toBe(-1);
    expect(result.route).toEqual([]);
  });

  it("DFS visits each reachable room once and leaves no frames on the stack", () => {
    const result = depthFirstScan({ x: 0, y: 0 }, canEnter);
    const visited = new Set(result.order.map(cellKey));

    expect(result.order).toHaveLength(7);
    expect(visited.size).toBe(7);
    expect([...visited].sort()).toEqual([...walkable].sort());
    expect(result.maxDepth).toBeGreaterThan(1);
    expect(result.finalStack).toEqual([]);
  });
});
