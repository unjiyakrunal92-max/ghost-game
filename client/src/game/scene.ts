import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
// Babylon 9 loads shader-store entries lazily; Vite's ESM optimization can let
// the first GLSL compile race those imports. Register every shader used here
// synchronously so normal mesh and glow-layer effects are ready before drawing.
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/default.fragment";
import "@babylonjs/core/Shaders/glowMapGeneration.vertex";
import "@babylonjs/core/Shaders/glowMapGeneration.fragment";
import "@babylonjs/core/Shaders/kernelBlur.vertex";
import "@babylonjs/core/Shaders/kernelBlur.fragment";
import "@babylonjs/core/Shaders/glowMapMerge.vertex";
import "@babylonjs/core/Shaders/glowMapMerge.fragment";
import "@babylonjs/core/Shaders/glowBlurPostProcess.fragment";
import { breadthFirstSearch, depthFirstScan, type Cell } from "./algorithms";
import { getLevelInfo, getLevelMap } from "./levels";

export const MANSION_MAP = getLevelMap(1);
const TILE = 1.08;
const FLOOR_TEXTURE = "/manus-storage/stone-floor_1f10459e.png";

type GameStatus = "playing" | "won" | "lost";
type Direction = "up" | "down" | "left" | "right";
export type MansionState = {
  status: GameStatus;
  level: number;
  lives: number;
  relics: string[];
  keyFound: boolean;
  gateOpen: boolean;
  flashlightOn: boolean;
  battery: number;
  player: Cell;
  ghost: Cell;
  moves: number;
  bfsDistance: number;
  bfsExpanded: number;
  bfsFrontier: number;
  dfsVisited: number;
  dfsDepth: number;
  scanActive: boolean;
  message: string;
  bfsRoute: Cell[];
  dfsCells: Cell[];
};
export type GameHandle = {
  scene: Scene;
  move: (direction: Direction) => void;
  toggleFlashlight: () => void;
  scan: () => void;
  restart: () => void;
  dispose: () => void;
};

function findChar(map: string[], char: string): Cell {
  const height = map.length;
  for (let y = 0; y < height; y++) {
    const x = map[y].indexOf(char);
    if (x >= 0) return { x, y };
  }
  throw new Error(`Missing map marker: ${char}`);
}
const cellKey = ({ x, y }: Cell) => `${x},${y}`;
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

export async function createGameScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
  onState: (state: MansionState) => void,
  level = 1,
): Promise<GameHandle> {
  const levelInfo = getLevelInfo(level);
  const MAP = getLevelMap(levelInfo.number);
  const WIDTH = MAP[0].length;
  const HEIGHT = MAP.length;
  const ghostCadence = levelInfo.ghostCadence;
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.58, 0.72, 0.79, 1);
  scene.fogMode = Scene.FOGMODE_EXP;
  scene.fogDensity = 0.006;
  scene.fogColor = new Color3(0.58, 0.72, 0.79);

  const camera = new ArcRotateCamera(
    "mansion-camera",
    -Math.PI / 4,
    0.58,
    22,
    new Vector3(0, 0, 0),
    scene,
  );
  camera.mode = Camera.PERSPECTIVE_CAMERA;
  camera.fov = 0.62;
  camera.minZ = 0.1;
  camera.maxZ = 100;
  camera.lowerRadiusLimit = 22;
  camera.upperRadiusLimit = 22;
  camera.inputs.clear();
  scene.activeCamera = camera;

  const hemi = new HemisphericLight("moonlight", new Vector3(0.1, 1, -0.2), scene);
  hemi.intensity = 1.18;
  hemi.diffuse = new Color3(0.78, 0.84, 1);
  hemi.groundColor = new Color3(0.24, 0.23, 0.33);
  const lanternLight = new PointLight("player-lantern", new Vector3(0, 1.2, 0), scene);
  lanternLight.diffuse = new Color3(1, 0.61, 0.25);
  lanternLight.specular = new Color3(1, 0.65, 0.25);
  lanternLight.intensity = 1.5;
  lanternLight.range = 6.2;
  const ghostLight = new PointLight("ghost-aura", new Vector3(0, 0.8, 0), scene);
  ghostLight.diffuse = new Color3(0.58, 0.22, 1);
  ghostLight.intensity = 0.7;
  ghostLight.range = 4.5;
  const glow = new GlowLayer("spectral-glow", scene, { blurKernelSize: 28 });
  glow.intensity = 0.55;

  const floorMat = new StandardMaterial("slate-floor", scene);
  const floorTexture = new Texture(FLOOR_TEXTURE, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  floorTexture.uScale = 0.64;
  floorTexture.vScale = 0.64;
  floorMat.diffuseTexture = floorTexture;
  floorMat.diffuseColor = new Color3(1, 0.98, 0.96);
  floorMat.emissiveColor = new Color3(0.28, 0.27, 0.24);
  floorMat.specularColor = new Color3(0.13, 0.12, 0.2);
  floorMat.specularPower = 38;

  const wallMatA = new StandardMaterial("inkstone", scene);
  wallMatA.diffuseColor = new Color3(0.36, 0.32, 0.46);
  wallMatA.emissiveColor = new Color3(0.10, 0.08, 0.13);
  wallMatA.specularColor = new Color3(0.31, 0.23, 0.42);
  const wallMatB = new StandardMaterial("plumstone", scene);
  wallMatB.diffuseColor = new Color3(0.52, 0.34, 0.45);
  wallMatB.emissiveColor = new Color3(0.13, 0.07, 0.1);
  wallMatB.specularColor = new Color3(0.42, 0.26, 0.4);
  const trimMat = new StandardMaterial("brass-trim", scene);
  trimMat.diffuseColor = new Color3(0.53, 0.31, 0.14);
  trimMat.emissiveColor = new Color3(0.22, 0.085, 0.018);
  const ironMat = new StandardMaterial("gate-iron", scene);
  ironMat.diffuseColor = new Color3(0.29, 0.34, 0.48);
  ironMat.emissiveColor = new Color3(0.035, 0.05, 0.12);
  ironMat.specularColor = new Color3(0.72, 0.74, 0.9);
  const floorGlow = new StandardMaterial("dfs-glow", scene);
  floorGlow.diffuseColor = new Color3(0.06, 0.72, 0.68);
  floorGlow.emissiveColor = new Color3(0.012, 0.29, 0.25);
  floorGlow.alpha = 0.19;
  floorGlow.disableLighting = true;
  const pathGlow = new StandardMaterial("bfs-glow", scene);
  pathGlow.diffuseColor = new Color3(0.95, 0.19, 0.3);
  pathGlow.emissiveColor = new Color3(0.95, 0.08, 0.2);
  pathGlow.alpha = 0.43;
  pathGlow.disableLighting = true;
  const accentGold = new StandardMaterial("relic-gold", scene);
  accentGold.diffuseColor = new Color3(1, 0.68, 0.18);
  accentGold.emissiveColor = new Color3(0.48, 0.23, 0.035);
  accentGold.specularColor = new Color3(1, 0.87, 0.52);
  const violet = new StandardMaterial("relic-violet", scene);
  violet.diffuseColor = new Color3(0.55, 0.28, 1);
  violet.emissiveColor = new Color3(0.31, 0.08, 0.85);
  const teal = new StandardMaterial("relic-teal", scene);
  teal.diffuseColor = new Color3(0.16, 0.9, 0.68);
  teal.emissiveColor = new Color3(0.04, 0.45, 0.31);
  const ghostMat = new StandardMaterial("spectral-ghost", scene);
  ghostMat.diffuseColor = new Color3(0.7, 0.45, 1);
  ghostMat.emissiveColor = new Color3(0.45, 0.13, 0.92);
  ghostMat.alpha = 0.84;
  ghostMat.specularColor = new Color3(0.95, 0.8, 1);
  const eyeMat = new StandardMaterial("ghost-eyes", scene);
  eyeMat.diffuseColor = new Color3(0.91, 0.96, 1);
  eyeMat.emissiveColor = new Color3(0.45, 0.62, 1);
  const playerCoatMat = new StandardMaterial("hunter-coat", scene);
  playerCoatMat.diffuseColor = new Color3(0.49, 0.12, 0.2);
  playerCoatMat.emissiveColor = new Color3(0.12, 0.025, 0.04);
  const skinMat = new StandardMaterial("hunter-face", scene);
  skinMat.diffuseColor = new Color3(0.87, 0.63, 0.48);
  const bookMat = new StandardMaterial("artifact-book", scene);
  bookMat.diffuseColor = new Color3(0.05, 0.38, 0.31);
  bookMat.emissiveColor = new Color3(0.015, 0.16, 0.12);
  const shadowMat = new StandardMaterial("pedestal-shadow", scene);
  shadowMat.diffuseColor = new Color3(0.07, 0.055, 0.12);
  shadowMat.emissiveColor = new Color3(0.045, 0.027, 0.09);

  const world = (cell: Cell, y = 0) =>
    new Vector3((cell.x - (WIDTH - 1) / 2) * TILE, y, (cell.y - (HEIGHT - 1) / 2) * TILE);
  const floorTiles = new Map<string, Mesh>();
  const dfsTiles = new Map<string, Mesh>();
  const bfsTiles = new Map<string, Mesh>();
  const itemNodes = new Map<string, TransformNode>();
  const itemChars: Record<string, string> = {};
  let gateNode: TransformNode | null = null;

  // Dark exhibition plinth gives the walkable map a clean, readable silhouette.
  const plinth = MeshBuilder.CreateBox("mansion-plinth", {
    width: WIDTH * TILE + 0.42,
    height: 0.22,
    depth: HEIGHT * TILE + 0.42,
  }, scene);
  plinth.position.y = -0.18;
  const plinthMat = new StandardMaterial("plinth-material", scene);
  plinthMat.diffuseColor = new Color3(0.2, 0.2, 0.32);
  plinthMat.emissiveColor = new Color3(0.07, 0.08, 0.15);
  plinth.material = plinthMat;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const marker = MAP[y][x];
      const cell = { x, y };
      if (marker === "#") {
        const wall = MeshBuilder.CreateBox(`wall-${x}-${y}`, {
          width: TILE * 0.98,
          height: 0.94,
          depth: TILE * 0.98,
        }, scene);
        wall.position = world(cell, 0.42);
        wall.material = (x * 7 + y * 3) % 5 === 0 ? wallMatB : wallMatA;
        wall.isPickable = false;
        const cap = MeshBuilder.CreateBox(`wall-cap-${x}-${y}`, {
          width: TILE * 1.02,
          height: 0.08,
          depth: TILE * 1.02,
        }, scene);
        cap.position = world(cell, 0.91);
        cap.material = (x + y) % 4 === 0 ? wallMatB : wallMatA;
        cap.isPickable = false;
        continue;
      }
      const tile = MeshBuilder.CreateBox(`floor-${x}-${y}`, {
        width: TILE * 0.96,
        height: 0.1,
        depth: TILE * 0.96,
      }, scene);
      tile.position = world(cell, -0.035);
      tile.material = floorMat;
      tile.isPickable = false;
      floorTiles.set(cellKey(cell), tile);

      const dfs = MeshBuilder.CreateBox(`dfs-cell-${x}-${y}`, {
        width: TILE * 0.88,
        height: 0.018,
        depth: TILE * 0.88,
      }, scene);
      dfs.position = world(cell, 0.025);
      dfs.material = floorGlow;
      dfs.isPickable = false;
      dfs.setEnabled(false);
      dfsTiles.set(cellKey(cell), dfs);

      const bfs = MeshBuilder.CreateBox(`bfs-cell-${x}-${y}`, {
        width: TILE * 0.77,
        height: 0.022,
        depth: TILE * 0.77,
      }, scene);
      bfs.position = world(cell, 0.049);
      bfs.material = pathGlow;
      bfs.isPickable = false;
      bfs.setEnabled(false);
      bfsTiles.set(cellKey(cell), bfs);

      if (["A", "B", "C", "K", "E"].includes(marker)) itemChars[cellKey(cell)] = marker;
      if (marker === "D") {
        gateNode = new TransformNode("locked-gate", scene);
        gateNode.position = world(cell, 0.02);
        const lintel = MeshBuilder.CreateBox("gate-lintel", { width: TILE * 0.92, height: 0.14, depth: 0.16 }, scene);
        lintel.parent = gateNode;
        lintel.position.y = 0.77;
        lintel.material = ironMat;
        for (let i = 0; i < 5; i++) {
          const bar = MeshBuilder.CreateBox(`gate-bar-${i}`, { width: 0.065, height: 0.77, depth: 0.13 }, scene);
          bar.parent = gateNode;
          bar.position.set(-0.43 + i * 0.215, 0.36, 0);
          bar.material = ironMat;
        }
        const lock = MeshBuilder.CreateTorus("gate-lock", { diameter: 0.2, thickness: 0.04, tessellation: 14 }, scene);
        lock.parent = gateNode;
        lock.position.set(0, 0.48, -0.09);
        lock.material = trimMat;
      }
    }
  }

  // Small warm sconces give the stonework depth without obscuring the route overlays.
  const sconceCells: Cell[] = [{ x: 1, y: 3 }, { x: 5, y: 2 }, { x: 8, y: 3 }, { x: 2, y: 5 }, { x: 8, y: 6 }];
  sconceCells.forEach((cell, i) => {
    const candle = MeshBuilder.CreateCylinder(`sconce-${i}`, { height: 0.16, diameter: 0.09, tessellation: 8 }, scene);
    candle.position = world(cell, 0.3);
    candle.material = trimMat;
    const flame = MeshBuilder.CreateSphere(`sconce-flame-${i}`, { diameter: 0.13, segments: 8 }, scene);
    flame.position = world(cell, 0.43);
    const flameMat = new StandardMaterial(`candle-glow-${i}`, scene);
    flameMat.diffuseColor = new Color3(1, 0.63, 0.23);
    flameMat.emissiveColor = new Color3(0.95, 0.29, 0.045);
    flame.material = flameMat;
    const light = new PointLight(`sconce-light-${i}`, world(cell, 0.62), scene);
    light.diffuse = new Color3(1, 0.42, 0.15);
    light.intensity = 0.42;
    light.range = 2.4;
  });

  const createPedestal = (cell: Cell, tint: StandardMaterial) => {
    const root = new TransformNode(`pedestal-${cellKey(cell)}`, scene);
    root.position = world(cell, 0.02);
    const base = MeshBuilder.CreateCylinder("pedestal-base", { height: 0.14, diameter: 0.64, tessellation: 18 }, scene);
    base.parent = root;
    base.position.y = 0.07;
    base.material = shadowMat;
    const ring = MeshBuilder.CreateTorus("pedestal-ring", { diameter: 0.63, thickness: 0.035, tessellation: 18 }, scene);
    ring.parent = root;
    ring.position.y = 0.15;
    ring.material = tint;
    return root;
  };

  const skullCell = findChar(MAP, "A");
  const skullRoot = createPedestal(skullCell, accentGold);
  const skull = MeshBuilder.CreateSphere("first-relic-skull", { diameter: 0.39, segments: 12 }, scene);
  skull.parent = skullRoot;
  skull.position.y = 0.39;
  skull.material = accentGold;
  for (const x of [-0.085, 0.085]) {
    const eye = MeshBuilder.CreateSphere("skull-eye", { diameter: 0.085, segments: 8 }, scene);
    eye.parent = skullRoot;
    eye.position.set(x, 0.4, -0.15);
    eye.material = shadowMat;
  }
  itemNodes.set(cellKey(skullCell), skullRoot);

  const hourglassCell = findChar(MAP, "B");
  const hourglassRoot = createPedestal(hourglassCell, violet);
  const hourTop = MeshBuilder.CreateCylinder("hourglass-top", { height: 0.23, diameterTop: 0.05, diameterBottom: 0.28, tessellation: 6 }, scene);
  hourTop.parent = hourglassRoot;
  hourTop.position.y = 0.34;
  hourTop.material = violet;
  const hourBottom = MeshBuilder.CreateCylinder("hourglass-bottom", { height: 0.23, diameterTop: 0.28, diameterBottom: 0.05, tessellation: 6 }, scene);
  hourBottom.parent = hourglassRoot;
  hourBottom.position.y = 0.55;
  hourBottom.material = violet;
  const hourBar = MeshBuilder.CreateCylinder("hourglass-sand", { height: 0.04, diameter: 0.12, tessellation: 8 }, scene);
  hourBar.parent = hourglassRoot;
  hourBar.position.y = 0.45;
  hourBar.material = accentGold;
  itemNodes.set(cellKey(hourglassCell), hourglassRoot);

  const bookCell = findChar(MAP, "C");
  const bookRoot = createPedestal(bookCell, teal);
  const book = MeshBuilder.CreateBox("third-relic-book", { width: 0.45, height: 0.11, depth: 0.37 }, scene);
  book.parent = bookRoot;
  book.position.set(0, 0.32, 0);
  book.rotation.y = -0.24;
  book.material = bookMat;
  const rune = MeshBuilder.CreateBox("book-rune", { width: 0.12, height: 0.012, depth: 0.12 }, scene);
  rune.parent = bookRoot;
  rune.position.set(0, 0.39, 0);
  rune.material = teal;
  itemNodes.set(cellKey(bookCell), bookRoot);

  const keyCell = findChar(MAP, "K");
  const keyRoot = new TransformNode("brass-key", scene);
  keyRoot.position = world(keyCell, 0.13);
  const keyLoop = MeshBuilder.CreateTorus("key-loop", { diameter: 0.23, thickness: 0.055, tessellation: 14 }, scene);
  keyLoop.parent = keyRoot;
  keyLoop.position.x = -0.1;
  keyLoop.material = accentGold;
  const keyStem = MeshBuilder.CreateCylinder("key-stem", { height: 0.37, diameter: 0.06, tessellation: 8 }, scene);
  keyStem.parent = keyRoot;
  keyStem.rotation.z = Math.PI / 2;
  keyStem.position.x = 0.12;
  keyStem.material = accentGold;
  const keyTooth = MeshBuilder.CreateBox("key-tooth", { width: 0.1, height: 0.07, depth: 0.07 }, scene);
  keyTooth.parent = keyRoot;
  keyTooth.position.set(0.26, -0.035, 0);
  keyTooth.material = accentGold;
  itemNodes.set(cellKey(keyCell), keyRoot);

  const exitCell = findChar(MAP, "E");
  const exitRoot = new TransformNode("estate-exit", scene);
  exitRoot.position = world(exitCell, 0.07);
  const exitRing = MeshBuilder.CreateTorus("exit-seal", { diameter: 0.68, thickness: 0.055, tessellation: 28 }, scene);
  exitRing.parent = exitRoot;
  exitRing.material = teal;
  const exitMark = MeshBuilder.CreateBox("exit-mark", { width: 0.3, height: 0.025, depth: 0.3 }, scene);
  exitMark.parent = exitRoot;
  exitMark.position.y = 0.02;
  exitMark.material = teal;
  itemNodes.set(cellKey(exitCell), exitRoot);

  const playerStart = findChar(MAP, "S");
  const ghostStart = findChar(MAP, "G");
  const playerRoot = new TransformNode("ghost-hunter", scene);
  const playerBody = MeshBuilder.CreateCylinder("hunter-coat", { height: 0.55, diameterTop: 0.32, diameterBottom: 0.43, tessellation: 8 }, scene);
  playerBody.parent = playerRoot;
  playerBody.position.y = 0.3;
  playerBody.material = playerCoatMat;
  const playerHead = MeshBuilder.CreateSphere("hunter-head", { diameter: 0.27, segments: 10 }, scene);
  playerHead.parent = playerRoot;
  playerHead.position.y = 0.65;
  playerHead.material = skinMat;
  const hat = MeshBuilder.CreateCylinder("hunter-hat", { height: 0.1, diameterTop: 0.18, diameterBottom: 0.34, tessellation: 8 }, scene);
  hat.parent = playerRoot;
  hat.position.y = 0.79;
  hat.material = shadowMat;
  const lantern = MeshBuilder.CreateSphere("hunter-lantern", { diameter: 0.12, segments: 8 }, scene);
  lantern.parent = playerRoot;
  lantern.position.set(0.23, 0.42, 0.05);
  lantern.material = accentGold;

  const ghostRoot = new TransformNode("wraith", scene);
  ghostRoot.position = world(ghostStart, 0);
  const ghostBody = MeshBuilder.CreateSphere("wraith-body", { diameter: 0.66, segments: 14 }, scene);
  ghostBody.parent = ghostRoot;
  ghostBody.position.y = 0.52;
  ghostBody.scaling.y = 1.13;
  ghostBody.material = ghostMat;
  const ghostTail = MeshBuilder.CreateCylinder("wraith-tail", { height: 0.3, diameterTop: 0.22, diameterBottom: 0.49, tessellation: 10 }, scene);
  ghostTail.parent = ghostRoot;
  ghostTail.position.y = 0.24;
  ghostTail.material = ghostMat;
  for (const x of [-0.12, 0.12]) {
    const eye = MeshBuilder.CreateSphere("wraith-eye", { diameter: 0.105, segments: 8 }, scene);
    eye.parent = ghostRoot;
    eye.position.set(x, 0.58, -0.25);
    eye.material = eyeMat;
  }

  playerRoot.position = world(playerStart, 0);
  let state: MansionState = {
    status: "playing",
    level: levelInfo.number,
    lives: 3,
    relics: [],
    keyFound: false,
    gateOpen: false,
    flashlightOn: true,
    battery: 100,
    player: playerStart,
    ghost: ghostStart,
    moves: 0,
    bfsDistance: 0,
    bfsExpanded: 0,
    bfsFrontier: 0,
    dfsVisited: 0,
    dfsDepth: 0,
    scanActive: false,
    message: "Find the key, recover three relics, and reach the exit.",
    bfsRoute: [],
    dfsCells: [],
  };
  const collected = new Set<string>();
  const visualTargets = { player: world(playerStart, 0), ghost: world(ghostStart, 0) };
  const visualCurrent = { player: world(playerStart, 0), ghost: world(ghostStart, 0) };
  let animationProgress = 1;
  let scanUntil = 0;
  let dfsOrder: Cell[] = [];
  let lastBfsRoute: Cell[] = [];
  let lastBfsExpanded: Cell[] = [];

  const isWalkable = (cell: Cell) =>
    cell.x >= 0 && cell.y >= 0 && cell.x < WIDTH && cell.y < HEIGHT &&
    MAP[cell.y][cell.x] !== "#" && (MAP[cell.y][cell.x] !== "D" || state.gateOpen);

  const updateBfs = () => {
    const result = breadthFirstSearch(state.ghost, state.player, isWalkable);
    lastBfsRoute = result.route;
    lastBfsExpanded = result.order;
    state = {
      ...state,
      bfsDistance: result.distance,
      bfsExpanded: result.order.length,
      bfsFrontier: Math.max(0, result.order.length - result.route.length),
      bfsRoute: result.route.map((cell) => ({ ...cell })),
    };
    bfsTiles.forEach((mesh, key) => mesh.setEnabled(result.route.some((cell) => cellKey(cell) === key)));
  };

  const publish = () => onState({ ...state, player: { ...state.player }, ghost: { ...state.ghost }, relics: [...state.relics], bfsRoute: [...state.bfsRoute], dfsCells: [...state.dfsCells] });
  const setMessage = (message: string) => { state = { ...state, message }; publish(); };

  const moveNodesToCells = () => {
    visualTargets.player = world(state.player, 0);
    visualTargets.ghost = world(state.ghost, 0);
    animationProgress = 0;
  };

  const resetRun = (keepCollected = false) => {
    state = {
      status: "playing",
      level: levelInfo.number,
      lives: 3,
      relics: [],
      keyFound: false,
      gateOpen: false,
      flashlightOn: true,
      battery: 100,
      player: playerStart,
      ghost: ghostStart,
      moves: 0,
      bfsDistance: 0,
      bfsExpanded: 0,
      bfsFrontier: 0,
      dfsVisited: 0,
      dfsDepth: 0,
      scanActive: false,
      message: "Find the key, recover three relics, and reach the exit.",
      bfsRoute: [],
      dfsCells: [],
    };
    if (!keepCollected) {
      collected.clear();
      itemNodes.forEach((node) => node.setEnabled(true));
    }
    gateNode?.setEnabled(true);
    lanternLight.setEnabled(true);
    dfsTiles.forEach((mesh) => mesh.setEnabled(false));
    state = { ...state, player: playerStart, ghost: ghostStart };
    visualCurrent.player = world(playerStart, 0);
    visualCurrent.ghost = world(ghostStart, 0);
    moveNodesToCells();
    updateBfs();
    publish();
  };

  const loseLife = () => {
    const lives = state.lives - 1;
    const status: GameStatus = lives <= 0 ? "lost" : "playing";
    state = {
      ...state,
      lives: Math.max(0, lives),
      status,
      player: playerStart,
      ghost: ghostStart,
      moves: 0,
      message: status === "lost" ? "The wraith has claimed the mansion. Begin again?" : `Caught in the corridor — ${Math.max(0, lives)} ${lives === 1 ? "life" : "lives"} remain. Keep moving.`,
    };
    moveNodesToCells();
    dfsTiles.forEach((mesh) => mesh.setEnabled(false));
    updateBfs();
    publish();
  };

  const collectAtPlayer = () => {
    const key = cellKey(state.player);
    const marker = itemChars[key];
    if (!marker || collected.has(key)) return "";
    if (marker === "K") {
      collected.add(key);
      itemNodes.get(key)?.setEnabled(false);
      state = { ...state, keyFound: true, gateOpen: true, message: "Brass key found — the iron gate clicks open." };
      gateNode?.setEnabled(false);
      return "key";
    }
    if (marker === "A" || marker === "B" || marker === "C") {
      collected.add(key);
      itemNodes.get(key)?.setEnabled(false);
      const names: Record<string, string> = { A: "Gilded skull", B: "Timeglass", C: "The green grimoire" };
      state = { ...state, relics: [...state.relics, marker], message: `${names[marker]} recovered — ${state.relics.length + 1} of 3 relics.` };
      return marker;
    }
    if (marker === "E" && state.relics.length === 3) {
      state = { ...state, status: "won", message: "The three relics are yours. You escaped Mourningwood Estate." };
      return "win";
    }
    if (marker === "E") state = { ...state, message: "The exit is sealed. Recover all 3 relics first." };
    return "";
  };

  const move = (direction: Direction) => {
    if (state.status !== "playing") return;
    const delta: Record<Direction, Cell> = {
      up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
    };
    const step = delta[direction];
    const target = { x: state.player.x + step.x, y: state.player.y + step.y };
    if (!isWalkable(target)) {
      if (target.x >= 0 && target.y >= 0 && target.x < WIDTH && target.y < HEIGHT && MAP[target.y][target.x] === "D") {
        setMessage("The iron gate is locked. Find the brass key first.");
      }
      return;
    }
    state = { ...state, player: target, moves: state.moves + 1, message: "The wraith is following your shortest route…" };
    if (state.flashlightOn) {
      const battery = Math.max(0, state.battery - 5);
      state = { ...state, battery, flashlightOn: battery > 0 };
      lanternLight.setEnabled(battery > 0);
    }
    const picked = collectAtPlayer();
    moveNodesToCells();
    if (picked === "win") {
      updateBfs();
      publish();
      return;
    }
    if (same(state.player, state.ghost)) {
      loseLife();
      return;
    }

    // BFS is the wraith's only pursuit algorithm: one legal shortest-path step per move.
    const pursuit = breadthFirstSearch(state.ghost, state.player, isWalkable);
    lastBfsRoute = pursuit.route;
    lastBfsExpanded = pursuit.order;
    // The ghost moves on every third player step, leaving a clear tactical window.
    if (state.moves % ghostCadence === 0 && pursuit.route.length > 1) state = { ...state, ghost: pursuit.route[1] };
    moveNodesToCells();
    if (same(state.player, state.ghost)) {
      loseLife();
      return;
    }
    updateBfs();
    publish();
  };

  const toggleFlashlight = () => {
    if (state.battery <= 0) {
      setMessage("The lantern is empty. Keep moving by the moonlight.");
      return;
    }
    state = { ...state, flashlightOn: !state.flashlightOn, message: state.flashlightOn ? "Lantern shuttered — preserve its charge." : "Lantern lit — the corridors come alive." };
    lanternLight.setEnabled(state.flashlightOn);
    publish();
  };

  const scan = () => {
    if (state.status !== "playing") return;
    const scanResult = depthFirstScan(state.player, isWalkable);
    dfsOrder = scanResult.order;
    state = {
      ...state,
      dfsVisited: scanResult.order.length,
      dfsDepth: scanResult.maxDepth,
      dfsCells: scanResult.order.map((cell) => ({ ...cell })),
      scanActive: true,
      message: `DFS scan: ${scanResult.order.length} reachable rooms traced using a stack.`,
    };
    dfsTiles.forEach((mesh, key) => mesh.setEnabled(scanResult.order.some((cell) => cellKey(cell) === key)));
    scanUntil = new URLSearchParams(window.location.search).has("demo") ? Number.POSITIVE_INFINITY : performance.now() + 5200;
    publish();
  };

  const keyboardMap: Record<string, Direction> = {
    ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down",
    ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right",
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const direction = keyboardMap[event.key];
    if (direction) {
      event.preventDefault();
      move(direction);
    } else if (event.key === "f" || event.key === "F") {
      event.preventDefault();
      toggleFlashlight();
    } else if (event.code === "Space") {
      event.preventDefault();
      scan();
    } else if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      resetRun();
    }
  };
  window.addEventListener("keydown", onKeyDown);

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.09, engine.getDeltaTime() / 1000);
    if (animationProgress < 1) {
      animationProgress = Math.min(1, animationProgress + dt * 6.5);
      const eased = 1 - Math.pow(1 - animationProgress, 3);
      playerRoot.position = Vector3.Lerp(visualCurrent.player, visualTargets.player, eased);
      ghostRoot.position = Vector3.Lerp(visualCurrent.ghost, visualTargets.ghost, eased);
      if (animationProgress >= 1) {
        visualCurrent.player = visualTargets.player.clone();
        visualCurrent.ghost = visualTargets.ghost.clone();
      }
    }
    const t = performance.now() / 1000;
    playerRoot.position.y = Math.sin(t * 2.5) * 0.004;
    ghostRoot.position.y = Math.sin(t * 3.2) * 0.045;
    ghostRoot.rotation.y = Math.sin(t * 1.1) * 0.08;
    lanternLight.position = playerRoot.position.add(new Vector3(0.18, 0.7, 0));
    ghostLight.position = ghostRoot.position.add(new Vector3(0, 0.85, 0));
    itemNodes.forEach((node, key) => {
      if (collected.has(key)) return;
      node.rotation.y = Math.sin(t * 0.55 + Number(key.split(",")[0])) * 0.1;
      node.position.y = world({ x: Number(key.split(",")[0]), y: Number(key.split(",")[1]) }, 0.02).y + Math.sin(t * 1.7 + Number(key.split(",")[0])) * 0.035;
    });
    if (state.scanActive && performance.now() > scanUntil) {
      state = { ...state, scanActive: false };
      dfsTiles.forEach((mesh) => mesh.setEnabled(false));
      publish();
    }
  });

  const resize = () => {
    engine.resize();
    const aspect = Math.max(0.65, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    const wantedHeight = Math.max(12, 14.7 / aspect);
    camera.radius = wantedHeight / (2 * Math.tan(camera.fov / 2));
    camera.lowerRadiusLimit = camera.radius;
    camera.upperRadiusLimit = camera.radius;
  };
  window.addEventListener("resize", resize);
  resize();
  (window as Window & { __mansionScene?: Scene }).__mansionScene = scene;
  updateBfs();
  lanternLight.setEnabled(true);
  publish();
  if (new URLSearchParams(window.location.search).has("demo")) {
    scan();
    window.setTimeout(() => move("right"), 900);
    window.setTimeout(() => scan(), 1500);
  }

  return {
    scene,
    move,
    toggleFlashlight,
    scan,
    restart: () => resetRun(),
    dispose: () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", resize);
      scene.dispose();
    },
  };
}
