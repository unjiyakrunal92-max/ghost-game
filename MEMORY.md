# Memory

- Project initialized as a static React + Vite WebDev app at `/home/ubuntu/haunted-mansion-ghost-hunter`.
- Babylon.js is installed. Use Babylon as the full-screen game canvas; React is for HUD and buttons.
- The initial user request prioritizes Design and Analysis of Algorithms and explicitly caps featured DAA algorithms at two. Keep the educational scope exactly to BFS + DFS.
- The WebDev shell requires an explicit `cd /home/ubuntu/haunted-mansion-ghost-hunter` before project commands; a direct `cwd` request was rejected once.
- Do not create checkpoints until the game is implemented and visually verified; WebDev initialization requires one end-of-work checkpoint only.

- Visual target generated and reviewed; runtime slate texture uploaded as `/manus-storage/stone-floor_1f10459e.png`.
- The UI uses an icy blue, violet, and teal palette; `/?demo` keeps a DFS scan visible and demonstrates one player step for screenshots.
- Movement supports window-level WASD/arrows, four desktop D-pad buttons, mobile stage swipes, and an optional 80–92px pointer-captured joystick with persisted visibility. Keep `touch-action: none` on the canvas/joystick and stop the joystick's pointer events from bubbling into board swipes.
- Game CSS hides known inline Manus badge selectors. The official host-level “Made with Manus” setting is in the website preview toolbar: Settings → Advanced → Hide Manus badge; host chrome outside the app DOM cannot be controlled by app CSS.
- Tutorial completion is stored independently for each account ID, so a guest or another player completing onboarding never skips it for a first-time account.

- Babylon 9.28's lazy ESM shader imports raced Vite's optimized preview on first render: GLSL reached `#include<...>` unexpanded, the StandardMaterial effect failed, and the board showed only `clearColor`. `scene.ts` now statically imports the default and glow/blur shader-store modules; keep the `server/babylon-shaders.test.ts` regression test. Browser verification should use `isReadyForSubMesh(mesh, subMesh)` for materials (base `isReady(mesh)` does not exercise the actual draw path).

- A clean page load showed the last stale effect was `glowMapGeneration`: Vite served HTML for Babylon's lazy-loaded module, causing an unresolved `<` token. Its vertex/fragment sources are now statically registered alongside the default, merge, and blur shaders; the new shader regression test includes all nine shader keys.
