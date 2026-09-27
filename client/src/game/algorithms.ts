/**
 * Graph-search algorithms for the haunted mansion game.
 *
 * BFS (Breadth-First Search) — used by the ghost to find the shortest path
 *   to the player. It explores all cells at distance d before any at d+1.
 *
 * DFS (Depth-First Scan) — used by the "Scan rooms" feature. It follows
 *   corridors deeply before backtracking, revealing the reachable map.
 */

/** A cell coordinate on the 2D mansion grid. */
export type Cell = { x: number; y: number };

type IsWalkable = (cell: Cell) => boolean;

const cellKey = ({ x, y }: Cell): string => `${x},${y}`;

/** The four cardinal neighbours of a cell. */
function neighbours(cell: Cell): Cell[] {
  return [
    { x: cell.x, y: cell.y - 1 }, // up
    { x: cell.x, y: cell.y + 1 }, // down
    { x: cell.x - 1, y: cell.y }, // left
    { x: cell.x + 1, y: cell.y }, // right
  ];
}

// ---------------------------------------------------------------------------
// BFS – Breadth-First Search
// ---------------------------------------------------------------------------

export type BfsResult = {
  /** Number of edges in the shortest path (−1 if unreachable). */
  distance: number;
  /**
   * The full shortest route from `start` to `goal`, both inclusive.
   * Empty when the goal is unreachable.
   */
  route: Cell[];
  /**
   * Every cell that BFS expanded (visited), in the order they were dequeued.
   * Useful for visualising how BFS fans out layer by layer.
   */
  order: Cell[];
};

/**
 * Standard BFS on a 2D grid.
 *
 * Returns the shortest path from `start` to `goal` through cells where
 * `isWalkable` returns true. The route includes both endpoints.
 */
export function breadthFirstSearch(
  start: Cell,
  goal: Cell,
  isWalkable: IsWalkable,
): BfsResult {
  const startKey = cellKey(start);
  const goalKey = cellKey(goal);

  // Edge case: start IS the goal.
  if (startKey === goalKey) {
    return { distance: 0, route: [{ ...start }], order: [{ ...start }] };
  }

  const visited = new Set<string>([startKey]);
  const parent = new Map<string, string>(); // child-key → parent-key
  const cellOf = new Map<string, Cell>(); // key → Cell for reconstruction
  cellOf.set(startKey, start);

  const queue: Cell[] = [start];
  const order: Cell[] = []; // expansion order for visualisation

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = cellKey(current);
    order.push({ ...current });

    for (const next of neighbours(current)) {
      const nextKey = cellKey(next);
      if (visited.has(nextKey)) continue;
      if (!isWalkable(next)) continue;

      visited.add(nextKey);
      parent.set(nextKey, currentKey);
      cellOf.set(nextKey, next);

      if (nextKey === goalKey) {
        // Reconstruct the path from goal back to start.
        const route: Cell[] = [];
        let traceKey: string | undefined = nextKey;
        while (traceKey !== undefined) {
          route.push({ ...cellOf.get(traceKey)! });
          traceKey = parent.get(traceKey);
        }
        route.reverse();
        return { distance: route.length - 1, route, order };
      }

      queue.push(next);
    }
  }

  // Goal is unreachable.
  return { distance: -1, route: [], order };
}

// ---------------------------------------------------------------------------
// DFS – Depth-First Scan
// ---------------------------------------------------------------------------

export type DfsResult = {
  /** Every reachable cell in the order DFS first visited it. */
  order: Cell[];
  /** The deepest recursion / stack depth reached during the scan. */
  maxDepth: number;
  /**
   * The stack when the scan finishes — always empty for a completed DFS,
   * because every pushed frame is eventually popped.
   */
  finalStack: Cell[];
};

/**
 * Iterative DFS that visits every cell reachable from `start`.
 *
 * Uses an explicit stack (no recursion) so the game can animate the
 * exploration frame by frame.
 */
export function depthFirstScan(
  start: Cell,
  isWalkable: IsWalkable,
): DfsResult {
  const visited = new Set<string>();
  const order: Cell[] = [];
  const stack: Cell[] = [start];
  let maxDepth = 0;

  // We track depth with a parallel number stack.
  const depthStack: number[] = [0];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const depth = depthStack.pop()!;
    const key = cellKey(current);

    if (visited.has(key)) continue;
    visited.add(key);
    order.push({ ...current });

    if (depth > maxDepth) maxDepth = depth;

    // Push neighbours in reverse order so the first cardinal direction
    // (up) is popped first, giving a predictable traversal.
    const nexts = neighbours(current).filter(
      (n) => !visited.has(cellKey(n)) && isWalkable(n),
    );
    for (let i = nexts.length - 1; i >= 0; i--) {
      stack.push(nexts[i]);
      depthStack.push(depth + 1);
    }
  }

  // A completed DFS always empties its stack.
  return { order, maxDepth, finalStack: [] };
}
