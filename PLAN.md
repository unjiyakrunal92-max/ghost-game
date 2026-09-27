# Game Plan: Haunted Mansion — AI Ghost Hunter

## Risk Tasks

### BFS Ghost Pursuit
- **Why isolated:** Dynamic player and ghost positions plus a locked gate can create invalid paths or make the ghost appear to teleport.
- **Approach:** Model the fixed 11×9 authored tile layout as a four-neighbor grid. Run breadth-first search from the ghost to the player after each successful player step, excluding walls and locked doors. Move the ghost exactly one cell along the returned shortest path every third player turn; recompute and display the route after each player turn. Retain the visited order, distance, and next step for the on-screen trace.
- **Verify:** The ghost advances one adjacent tile per player move, never crosses a wall or locked door, and the displayed BFS path terminates at the player with shortest distance.

### DFS Room Scan
- **Why isolated:** The exploration overlay and traversal trace must agree; a static map should not imply a second pathfinding algorithm.
- **Approach:** On scan, run depth-first search from the player's cell across currently walkable cells. Explicitly show the DFS stack and discovery order, reveal the scanned walkable rooms for a short period, and keep this as the only DFS use.
- **Verify:** DFS discovery order contains no duplicates, all reachable walkable cells are eventually visited, and the scan highlight follows the recorded order.

## Main Build

- Full-screen Babylon.js grid rendered with a fixed angled orthographic camera; React provides HUD/menus and controls.
- Hand-authored grid, player movement, 3 lives, finite flashlight charge, a key, a locked gate, 3 relics, and an exit.
- The goal is to collect the key and all 3 relics, then reach the exit before losing all 3 lives.
- Controls: WASD/arrows to move, F to toggle flashlight, Space to run DFS scan, R to restart. Desktop directional buttons remain beside the board; board swipes work on mobile, and a compact 80–92px joystick can be toggled on/off and dragged or flicked for one cardinal move.
- A tutorial/algorithm panel explains BFS queue/frontier/shortest path and DFS stack/deep exploration; the UI displays live visits, route length, stack/queue and scan log.
- `?demo` presents an explanatory deterministic start state for screenshot checks without changing ordinary gameplay.
- **Assets needed:** Generated seamless dark slate tile texture for the playable floor; generated 16:9 in-game reference for art direction. Other game entities are readable Babylon primitive meshes with designed materials.
- **Verify:**
  - WASD/arrows, the desktop D-pad, stage-wide mobile board swipes, and the optional pointer-captured joystick move the player by one valid adjacent tile; the joystick's show/hide preference persists across reloads.
  - Tutorial dismissal is scoped to the account, and a first-time account sees onboarding even after a guest or another account completed it.
  - Ghost uses only BFS to approach by one legal shortest-path step per move; wall and locked-gate constraints hold.
  - DFS scan highlights rooms and reports a matching stack/discovery trace.
  - Key unlocks the gate, all 3 artifacts increment the counter, and the exit wins only once all artifacts are collected.
  - Ghost contact reduces lives; loss and win overlays offer a working restart.
  - Flashlight toggles and charge drains only while on.
  - HUD remains readable and unclipped at desktop and mobile widths.
  - No missing textures, runtime errors, or build/type errors.
  - Final screenshot shows the game board, algorithm explanation, and gameplay HUD.
