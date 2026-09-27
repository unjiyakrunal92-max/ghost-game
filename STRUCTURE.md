# Structure

## Runtime shape

- `client/src/App.tsx` routes `/` directly to the game shell.
- `client/src/components/GameCanvas.tsx` owns the one Babylon engine/canvas lifecycle and DOM HUD. It initializes once, disposes listeners and engine on unmount, relays state/actions, handles stage-level board swipe gestures and pointer-captured compact joystick drags, and exposes a persistent mobile joystick toggle.
- `client/src/game/algorithms.ts` contains the only two named DAA algorithms: BFS (ghost shortest path) and DFS (room scan).
- `client/src/game/input.ts` maps cardinal board/joystick pointer movement to one move and loads the saved touch-control preference; `client/src/game/onboarding.ts` isolates tutorial completion by guest/account scope.
- `client/src/game/scene.ts` owns the fixed authored map, Babylon scene, player/ghost state, rule transitions, rendering nodes, keyboard listeners, and the `GameHandle` API consumed by the HUD.
- `client/src/index.css` owns the responsive mansion UI, game framing, typography, overlays, motion, compact touch-tool sizing, and defensive hiding of inline Manus-badge selectors when injected into the app document.
- `/manus-storage/…` contains the generated playable floor texture. Original generated images stay outside the project in `/home/ubuntu/webdev-static-assets/haunted-mansion/`.

## Coordinate convention

- The fixed 11×9 grid `(col,row)` maps to Babylon `(x,0,z)`, centered around the board midpoint.
- `#` is a wall; `.` is a traversable floor; `S` player start; `G` ghost start; `K` key; `D` locked gate; `A/B/C` relics; `E` exit.
- BFS uses deterministic neighbor order: north, east, south, west.
- DFS uses the same neighbor ordering and a real explicit stack.

## Scope constraint

No procedural maze generation, A*, Dijkstra, or additional DAA algorithm is shipped. The map is hand-authored; ordinary movement/collision/game rules are not presented as DAA topics.
