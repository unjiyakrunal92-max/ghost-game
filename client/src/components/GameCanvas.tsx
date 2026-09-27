import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  CircleHelp,
  DoorOpen,
  Flame,
  Ghost,
  Gamepad2,
  Heart,
  KeyRound,
  LampDesk,
  LockKeyhole,
  LogOut,
  MoonStar,
  RotateCcw,
  ShieldCheck,
  Skull,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { createGameScene, type GameHandle, type MansionState } from "@/game/scene";
import type { Cell } from "@/game/algorithms";
import { getLevelInfo, MAX_LEVEL } from "@/game/levels";
import {
  directionFromJoystick,
  directionFromSwipe,
  MOBILE_JOYSTICK_STORAGE_KEY,
  readJoystickPreference,
} from "@/game/input";
import { tutorialCompletionKey, tutorialIsComplete, tutorialScopeForUser } from "@/game/onboarding";
import { readHighestUnlockedLevel, recordLevelWin } from "@/game/progression";
import { isLevelUnlocked } from "@shared/levelProgress";
import { useAuth } from "@/_core/hooks/useAuth";

type Direction = "up" | "down" | "left" | "right";
type TutorialStep = { title: string; copy: string; icon: typeof BookOpen; tag: string };
type LocalRun = {
  id: string;
  level: number;
  result: "won" | "lost";
  relicCount: number;
  turns: number;
  livesRemaining: number;
  durationSeconds: number;
  createdAt: string;
};

const tutorialSteps: TutorialStep[] = [
  {
    title: "Your mission",
    copy: "Find the brass key, recover all 3 relics, then reach the exit. You have 3 hearts—if the wraith catches you, you lose one and return to the entrance.",
    icon: KeyRound,
    tag: "COLLECT · UNLOCK · ESCAPE",
  },
  {
    title: "Move room by room",
    copy: "Swipe across the mansion, or switch on the compact joystick and drag or tap a direction. On desktop, use WASD / arrow keys. Every move matters. The lantern charge runs down while it is on.",
    icon: ArrowUp,
    tag: "TAP THE PAD OR USE YOUR KEYBOARD",
  },
  {
    title: "Scout before you go",
    copy: "Tap Scan rooms to reveal the reachable mansion. It uses Depth-First Search (DFS): it follows a corridor deeply, then backtracks to explore others. Scanning does not spend a turn.",
    icon: BookOpen,
    tag: "ROOM SCAN · DFS",
  },
  {
    title: "The ghost is thinking",
    copy: "The wraith is not random. Every few steps it uses Breadth-First Search (BFS) to choose a shortest route toward you. Collect the key to open the iron gate, then plan your escape. Clear a stage to unlock the next, all the way through level 50.",
    icon: Ghost,
    tag: "GHOST PURSUIT · BFS",
  },
];

const initialState: MansionState = {
  status: "playing",
  level: 1,
  lives: 3,
  relics: [],
  keyFound: false,
  gateOpen: false,
  flashlightOn: true,
  battery: 100,
  player: { x: 1, y: 1 },
  ghost: { x: 1, y: 7 },
  moves: 0,
  bfsDistance: 6,
  bfsExpanded: 0,
  bfsFrontier: 0,
  dfsVisited: 0,
  dfsDepth: 0,
  scanActive: false,
  message: "Find the key, recover three relics, and reach the exit.",
  bfsRoute: [],
  dfsCells: [],
};

function readTutorialComplete(scope: ReturnType<typeof tutorialScopeForUser>) {
  try {
    return tutorialIsComplete(scope, (key) => localStorage.getItem(key));
  } catch {
    return false;
  }
}

function readLocalRuns(): LocalRun[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem("last-relic-local-history") || "[]");
    return Array.isArray(parsed) ? (parsed as LocalRun[]).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function compactCells(cells: Cell[]) {
  return cells.slice(0, 7).map((cell) => `${String.fromCharCode(65 + cell.x)}${cell.y + 1}`).join(" · ");
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const swipeStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const joystickStartRef = useRef<{ pointerId: number; center: { x: number; y: number } } | null>(null);
  const tutorialScopeRef = useRef("guest");
  const startedRef = useRef(false);
  const gameRef = useRef<GameHandle | null>(null);
  const startedAtRef = useRef(Date.now());
  const savedRunRef = useRef<string | null>(null);
  const uploadedRunRef = useRef(new Set<string>());
  const [state, setState] = useState<MansionState>(initialState);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [activeLevel, setActiveLevel] = useState(1);
  const [highestUnlocked, setHighestUnlocked] = useState(1);
  const [authMessage, setAuthMessage] = useState("");
  const [localRuns, setLocalRuns] = useState<LocalRun[]>(readLocalRuns);
  const [joystickEnabled, setJoystickEnabled] = useState(() => {
    try {
      return readJoystickPreference((key) => localStorage.getItem(key));
    } catch {
      return true;
    }
  });
  const [joystickOffset, setJoystickOffset] = useState({ x: 0, y: 0 });
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const utils = trpc.useUtils();
  const accountQueryKey = user?.id ?? "";
  const historyQuery = trpc.history.list.useQuery(accountQueryKey, {
    enabled: isAuthenticated,
    retry: false,
  });
  const progressQuery = trpc.history.progress.useQuery(accountQueryKey, {
    enabled: isAuthenticated,
    retry: false,
  });
  const saveRun = trpc.history.save.useMutation({
    onSuccess: () => {
      utils.history.list.invalidate();
      utils.history.progress.invalidate();
    },
  });

  useEffect(() => {
    try {
      localStorage.setItem(MOBILE_JOYSTICK_STORAGE_KEY, joystickEnabled ? "on" : "off");
    } catch {
      // Input remains available when this browser disables local storage.
    }
  }, [joystickEnabled]);

  useEffect(() => {
    if (authLoading) return;
    const scope = tutorialScopeForUser(isAuthenticated && user ? user.id : null);
    tutorialScopeRef.current = scope;
    setTutorialStep(0);
    const demoMode = new URLSearchParams(window.location.search).has("demo");
    setTutorialOpen(!demoMode && !readTutorialComplete(scope));
    try {
      const unlocked = readHighestUnlockedLevel(scope, (key) => localStorage.getItem(key));
      setHighestUnlocked(unlocked);
      setActiveLevel(unlocked);
    } catch {
      setHighestUnlocked(1);
      setActiveLevel(1);
    }
  }, [authLoading, isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || typeof progressQuery.data !== "number") return;
    setHighestUnlocked((current) => Math.max(current, progressQuery.data ?? 1));
    setActiveLevel((current) => Math.max(current, progressQuery.data ?? 1));
  }, [isAuthenticated, progressQuery.data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    startedRef.current = true;
    let cancelled = false;
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    createGameScene(engine, canvas, setState, activeLevel).then((handle) => {
      if (cancelled) {
        handle.dispose();
        engine.dispose();
        return;
      }
      gameRef.current = handle;
      engine.runRenderLoop(() => handle.scene.render());
    });
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      gameRef.current?.dispose();
      gameRef.current = null;
      engine.dispose();
      startedRef.current = false;
    };
  }, [activeLevel]);

  useEffect(() => {
    if (!tutorialOpen && !accountOpen && !levelsOpen) return;
    const pauseWhileDialogIsOpen = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "w", "a", "s", "d", "W", "A", "S", "D", "f", "F", "r", "R"].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", pauseWhileDialogIsOpen, true);
    return () => window.removeEventListener("keydown", pauseWhileDialogIsOpen, true);
  }, [tutorialOpen, accountOpen, levelsOpen]);

  useEffect(() => {
    if (state.status === "playing") return;
    const runId = `${startedAtRef.current}:${state.level}:${state.status}:${state.moves}`;
    const now = Date.now();
    const durationSeconds = Math.max(0, Math.floor((now - startedAtRef.current) / 1000));
    const run: LocalRun = {
      id: runId,
      level: state.level,
      result: state.status,
      relicCount: state.relics.length,
      turns: state.moves,
      livesRemaining: state.lives,
      durationSeconds,
      createdAt: new Date(now).toISOString(),
    };
    if (savedRunRef.current !== runId) {
      savedRunRef.current = runId;
      if (state.status === "won") {
        try {
          const scope = tutorialScopeRef.current as ReturnType<typeof tutorialScopeForUser>;
          const unlocked = recordLevelWin(
            scope,
            state.level,
            (key) => localStorage.getItem(key),
            (key, value) => localStorage.setItem(key, value),
          );
          setHighestUnlocked((current) => Math.max(current, unlocked));
        } catch {
          // The server-backed account progress still syncs for signed-in players.
        }
      }
      setLocalRuns((previous) => {
        const next = [run, ...previous].slice(0, 8);
        try {
          localStorage.setItem("last-relic-local-history", JSON.stringify(next));
        } catch {
          // A private session may disable local storage; the current run still works.
        }
        return next;
      });
    }
    if (isAuthenticated && !uploadedRunRef.current.has(runId)) {
      uploadedRunRef.current.add(runId);
      saveRun.mutate({
        level: run.level,
        result: run.result,
        relicCount: run.relicCount,
        turns: run.turns,
        livesRemaining: run.livesRemaining,
        durationSeconds: run.durationSeconds,
      });
    }
  }, [isAuthenticated, saveRun.mutate, state.level, state.lives, state.relics.length, state.status, state.moves]);

  const gameOver = state.status !== "playing";
  const move = (direction: Direction) => gameRef.current?.move(direction);
  const onBoardPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gameOver) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!event.isPrimary) return;
    swipeStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The browser may already have cancelled the pointer; a matching up event
      // can still complete this gesture without failing the game UI.
    }
  };
  const onBoardPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gameOver) return;
    const start = swipeStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    swipeStartRef.current = null;
    const direction = directionFromSwipe({ x: start.x, y: start.y }, { x: event.clientX, y: event.clientY });
    if (direction) {
      event.preventDefault();
      move(direction);
    }
  };
  const onJoystickPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    joystickStartRef.current = {
      pointerId: event.pointerId,
      center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A canceled pointer should not interrupt the rest of the game UI.
    }
  };
  const onJoystickPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = joystickStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setJoystickOffset({
      x: Math.max(-20, Math.min(20, event.clientX - start.center.x)),
      y: Math.max(-20, Math.min(20, event.clientY - start.center.y)),
    });
  };
  const onJoystickPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = joystickStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    joystickStartRef.current = null;
    setJoystickOffset({ x: 0, y: 0 });
    const direction = directionFromJoystick(start.center, { x: event.clientX, y: event.clientY });
    if (direction) move(direction);
  };
  const finishTutorial = () => {
    try {
      localStorage.setItem(tutorialCompletionKey(tutorialScopeRef.current as ReturnType<typeof tutorialScopeForUser>), "complete");
    } catch {
      // Tutorial can still be dismissed when storage is unavailable.
    }
    setTutorialOpen(false);
    setTutorialStep(0);
  };
  const restart = () => {
    startedAtRef.current = Date.now();
    savedRunRef.current = null;
    uploadedRunRef.current.clear();
    setState((prev) => ({
      ...initialState,
      level: activeLevel,
      status: "playing",
    }));
    gameRef.current?.restart();
  };
  const startLevel = (level: number, overrideUnlocked?: number) => {
    const maxUnlocked = overrideUnlocked ?? highestUnlocked;
    if (!isLevelUnlocked(level, maxUnlocked)) return;
    setLevelsOpen(false);
    startedAtRef.current = Date.now();
    savedRunRef.current = null;
    uploadedRunRef.current.clear();
    if (level === activeLevel) {
      setState({ ...initialState, level, status: "playing" });
      gameRef.current?.restart();
      return;
    }
    setActiveLevel(level);
    setState({ ...initialState, level, status: "playing" });
  };
  const nextLevel = () => {
    const next = state.level + 1;
    if (next > MAX_LEVEL) {
      restart();
      return;
    }
    const newUnlocked = Math.max(highestUnlocked, next);
    setHighestUnlocked(newUnlocked);
    startLevel(next, newUnlocked);
  };
  const openAccount = () => {
    setAuthMessage("");
    setAccountOpen(true);
  };
  const beginSignIn = () => {
    try {
      startLogin();
    } catch {
      setAuthMessage("Sign-in is not configured for this preview environment yet.");
    }
  };
  const doLogout = async () => {
    try {
      await logout();
      setAccountOpen(false);
    } catch {
      setAuthMessage("We could not sign out just now. Please try again.");
    }
  };
  const displayName = user?.name || user?.email || "Mourningwood player";
  const tutorial = tutorialSteps[tutorialStep];
  const TutorialIcon = tutorial.icon;
  const history = isAuthenticated ? historyQuery.data ?? [] : localRuns;
  const levelInfo = getLevelInfo(activeLevel);

  return (
    <main className="arcade-page">
      <div className="arcade-shell">
        <header className="arcade-header">
          <div className="arcade-brand">
            <div className="brand-mark"><MoonStar size={21} /><span className="brand-spark">✦</span></div>
            <div><span className="brand-eyebrow">MOURNINGWOOD ESTATE</span><strong>THE LAST RELIC</strong></div>
          </div>
          <button className="level-chip level-chip-button" onClick={() => setLevelsOpen(true)} aria-label={`Open level selection. Level ${activeLevel} of ${MAX_LEVEL}; ${highestUnlocked} unlocked`}><span className="level-dot" /><span className="level-desktop-label">LEVEL {String(activeLevel).padStart(2, "0")} / {MAX_LEVEL}<i>•</i> {highestUnlocked} OPEN</span><span className="level-mobile-label">{String(activeLevel).padStart(2, "0")} / {MAX_LEVEL}</span></button>
          <div className="header-actions">
            <button className="help-button" onClick={() => { setTutorialStep(0); setTutorialOpen(true); }}><CircleHelp size={17} /><span>How to play</span></button>
            <button className="profile-button" onClick={openAccount}>
              {isAuthenticated ? <span className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</span> : <span className="profile-avatar guest-avatar"><Ghost size={16} /></span>}
              <span>{authLoading ? "Loading…" : isAuthenticated ? displayName.split(" ")[0] : "Sign in"}</span>
            </button>
          </div>
        </header>

        <section className="player-stats" aria-label="Hunt status">
          <div className="stat-pill stat-lives"><span className="stat-icon lives-icon"><Heart size={17} fill="currentColor" /></span><span><small>HEARTS</small><b>{state.lives}<i> / 3</i></b></span></div>
          <div className="stat-pill stat-relics"><span className="stat-icon relic-icon"><Sparkles size={17} /></span><span><small>RELICS</small><b>{state.relics.length}<i> / 3</i></b></span></div>
          <div className="stat-pill stat-lantern"><span className="stat-icon lantern-icon"><Flame size={17} /></span><span className="lantern-stat-copy"><small>LANTERN</small><b>{state.battery}%</b><span className="battery-track"><i style={{ width: `${state.battery}%` }} /></span></span></div>
          <div className="stat-pill stat-turns"><span className="stat-icon turns-icon"><RotateCcw size={16} /></span><span><small>STEPS</small><b>{state.moves}</b></span></div>
        </section>

        <section className="play-layout">
          <article className="scene-card">
            <div className="scene-card-head">
              <div className="scene-title"><span className="map-stamp"><MoonStar size={17} /></span><span><small>CHAPTER {levelInfo.chapter} · LEVEL {String(activeLevel).padStart(2, "0")}</small><strong>{levelInfo.chapterName}</strong></span></div>
              <div className="scene-head-meta"><span className="online-indicator" /> LIVE GAME <span className="scene-meta-divider">·</span> 11 × 9 ROOMS</div>
            </div>
            <div
              className="scene-stage"
              onPointerDown={onBoardPointerDown}
              onPointerUp={onBoardPointerUp}
              onPointerCancel={() => { swipeStartRef.current = null; }}
            >
              <canvas
                ref={canvasRef}
                className="mansion-canvas"
                aria-label="Interactive 3D haunted mansion board game. Swipe in a cardinal direction to move."
              />
              <div className="scene-wash" />
              <div className={`game-status-badge ${gameOver ? `game-${state.status}` : ""}`} role="status">
                {state.status === "won" ? <Trophy size={16} /> : state.status === "lost" ? <Skull size={16} /> : <Sparkles size={15} />}
                <span>{state.message}</span>
              </div>
              <div className="ghost-distance-badge"><Ghost size={16} /><span>Ghost</span><b>{state.bfsDistance < 0 ? "—" : state.bfsDistance} tiles away</b></div>
              <div className="mobile-touch-tools">
                <button
                  className="mobile-joystick-toggle"
                  type="button"
                  role="switch"
                  aria-checked={joystickEnabled}
                  onClick={() => setJoystickEnabled((enabled) => !enabled)}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  aria-label={`${joystickEnabled ? "Hide" : "Show"} joystick`}
                >
                  <Gamepad2 size={15} />
                  <span>Joystick</span>
                  <i className="joystick-switch"><b /></i>
                </button>
                {joystickEnabled && <div
                  className="mobile-joystick"
                  role="group"
                  aria-label="Touch joystick. Drag or tap toward a direction to move."
                  onPointerDown={onJoystickPointerDown}
                  onPointerMove={onJoystickPointerMove}
                  onPointerUp={onJoystickPointerUp}
                  onPointerCancel={() => { joystickStartRef.current = null; setJoystickOffset({ x: 0, y: 0 }); }}
                  onLostPointerCapture={() => { joystickStartRef.current = null; setJoystickOffset({ x: 0, y: 0 }); }}
                >
                  <span className="joystick-direction joystick-up"><ArrowUp size={13} /></span>
                  <span className="joystick-direction joystick-left"><ArrowLeft size={13} /></span>
                  <span className="joystick-direction joystick-right"><ArrowRight size={13} /></span>
                  <span className="joystick-direction joystick-down"><ArrowDown size={13} /></span>
                  <span className="joystick-knob" style={{ transform: `translate(calc(-50% + ${joystickOffset.x}px), calc(-50% + ${joystickOffset.y}px))` }} />
                </div>}
              </div>
              {state.scanActive && <div className="scan-badge"><BookOpen size={14} /> Rooms revealed: {state.dfsVisited}</div>}
              {gameOver && (
                <div
                  className="end-overlay"
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="end-card">
                    <div className="end-emblem">
                      {state.status === "won" ? <Trophy size={24} /> : <Skull size={24} />}
                    </div>
                    <span className="end-kicker">
                      {state.status === "won"
                        ? state.level === MAX_LEVEL
                          ? "CAMPAIGN COMPLETE"
                          : "LEVEL COMPLETE"
                        : "THE HUNT IS OVER"}
                    </span>
                    <h2>
                      {state.status === "won"
                        ? state.level === MAX_LEVEL
                          ? "All 50 levels cleared!"
                          : "You made it out!"
                        : "The mansion claims you."}
                    </h2>
                    <p>
                      {state.status === "won"
                        ? state.level === MAX_LEVEL
                          ? "You escaped every wing of the mansion. What a legendary hunt."
                          : `Level ${state.level} complete. Level ${state.level + 1} is now unlocked.`
                        : state.message}
                    </p>
                    {state.status === "won" && state.level < MAX_LEVEL ? (
                      <button
                        type="button"
                        className="primary-button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          nextLevel();
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                      >
                        Next level <ArrowRight size={17} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="primary-button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          restart();
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                      >
                        <RotateCcw size={17} /> {state.status === "won" ? "Replay level 50" : "Try again"}
                      </button>
                    )}
                    {state.status === "won" && (
                      <div className="campaign-progress-label">
                        {highestUnlocked} / {MAX_LEVEL} levels unlocked
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="scene-card-foot"><span><ShieldCheck size={15} /> Three hearts. One very clever ghost.</span><span className="algorithm-caption">The ghost moves every {levelInfo.ghostCadence} steps.</span></div>
          </article>

          <aside className="game-sidebar">
            <section className="objective-card">
              <div className="side-card-title"><span className="side-icon objective-side-icon"><Sparkles size={17} /></span><span><small>YOUR MISSION</small><strong>Get out alive</strong></span></div>
              <p>Clear all 50 stages in order. This is level {activeLevel} of 50: find the key, recover every relic, and escape.</p>
              <ol className="mission-list">
                <li className={state.keyFound ? "mission-done" : "mission-current"}><span className="mission-step-icon">{state.keyFound ? <Check size={14} /> : <KeyRound size={14} />}</span><span>Find the brass key</span>{state.keyFound && <Check className="mission-check" size={15} />}</li>
                <li className={state.relics.length > 0 ? "mission-done" : ""}><span className="mission-step-icon">{state.relics.includes("A") ? <Check size={14} /> : <Skull size={14} />}</span><span>Recover the 3 relics <b>{state.relics.length}/3</b></span>{state.relics.includes("A") && <Check className="mission-check" size={15} />}</li>
                <li className={state.gateOpen ? "mission-current" : "mission-locked"}><span className="mission-step-icon">{state.gateOpen ? <DoorOpen size={14} /> : <LockKeyhole size={14} />}</span><span>Unlock the iron gate</span>{state.gateOpen && <Check className="mission-check" size={15} />}</li>
                <li className={state.relics.length === 3 ? "mission-current" : "mission-locked"}><span className="mission-step-icon"><DoorOpen size={14} /></span><span>Reach the exit</span></li>
              </ol>
              <div className="mission-progress"><span style={{ width: `${state.keyFound ? 20 + state.relics.length * 20 + (state.gateOpen ? 10 : 0) : 0}%` }} /></div>
              <div className="mission-progress-label"><span>Adventure progress</span><b>{state.relics.length} of 3 relics</b></div>
            </section>

            <section className="controls-card">
              <div className="side-card-title"><span className="side-icon controls-side-icon"><ArrowUp size={17} /></span><span><small>CONTROLS</small><strong>How to move</strong></span></div>
              <div className="control-row">
                <div className="dpad" aria-label="Movement controls">
                  <button className="dpad-up" onClick={() => move("up")} disabled={gameOver} aria-label="Move up"><ArrowUp size={18} /></button>
                  <button className="dpad-left" onClick={() => move("left")} disabled={gameOver} aria-label="Move left"><ArrowLeft size={18} /></button>
                  <span className="dpad-center"><span>MOVE</span></span>
                  <button className="dpad-right" onClick={() => move("right")} disabled={gameOver} aria-label="Move right"><ArrowRight size={18} /></button>
                  <button className="dpad-down" onClick={() => move("down")} disabled={gameOver} aria-label="Move down"><ArrowDown size={18} /></button>
                </div>
                <span className="keyboard-tip">Keyboard<br /><b>W A S D</b><br />or arrows</span>
              </div>
              <div className="tool-buttons">
                <button className="tool-button scan-tool" onClick={() => gameRef.current?.scan()} disabled={gameOver}>
                  <span className="tool-button-icon"><BookOpen size={17} /></span><span><b>Scan rooms</b><small>Explore with DFS · free turn</small></span><span className="tool-key">SPACE</span>
                </button>
                <button className={`tool-button lantern-tool ${state.flashlightOn ? "tool-active" : ""}`} onClick={() => gameRef.current?.toggleFlashlight()} disabled={gameOver}>
                  <span className="tool-button-icon"><LampDesk size={17} /></span><span><b>{state.flashlightOn ? "Lantern on" : "Lantern off"}</b><small>{state.flashlightOn ? "Tap to save its charge" : "Tap to light the rooms"}</small></span><span className="tool-key">F</span>
                </button>
              </div>
              <button className="reset-link" onClick={restart}><RotateCcw size={14} /> Restart adventure</button>
            </section>

            <button className="smart-ghost-tip" onClick={() => { setTutorialStep(3); setTutorialOpen(true); }}>
              <span className="ghost-tip-icon"><Ghost size={19} /></span><span><small>SMART GHOST</small><b>It learns the shortest way to you.</b><i>See how it works <ArrowRight size={13} /></i></span><ArrowRight className="tip-arrow" size={16} />
            </button>
          </aside>
        </section>

        <footer className="page-footer"><span><span className="footer-dot" /> You are safe here—for now.</span><span>DAA GAME STUDY <i>·</i> BFS + DFS</span></footer>
      </div>

      {levelsOpen && <div className="modal-backdrop level-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLevelsOpen(false); }}><section className="level-dialog" role="dialog" aria-modal="true" aria-labelledby="levels-title">
        <button className="modal-close" onClick={() => setLevelsOpen(false)} aria-label="Close level selection"><X size={18} /></button>
        <div className="level-dialog-heading"><span className="level-dialog-icon"><Trophy size={21} /></span><span><small>THE FULL ADVENTURE</small><h2 id="levels-title">50 mansion levels</h2><p>Finish each level to unlock the next one.</p></span></div>
        <div className="level-progress-track"><span style={{ width: `${(highestUnlocked / MAX_LEVEL) * 100}%` }} /></div>
        <div className="level-progress-copy"><span>{highestUnlocked >= MAX_LEVEL ? "All levels unlocked" : `Level ${highestUnlocked} is unlocked`}</span><b>{highestUnlocked} / {MAX_LEVEL}</b></div>
        <div className="level-chapter-list">{Array.from({ length: 5 }, (_, chapterIndex) => {
          const chapterNumber = chapterIndex + 1;
          const chapterInfo = getLevelInfo(chapterNumber * 10 - 9);
          return <section className="level-chapter" key={chapterNumber}>
            <div className="level-chapter-heading"><span>CHAPTER {String(chapterNumber).padStart(2, "0")}</span><b>{chapterInfo.chapterName}</b></div>
            <div className="level-grid">{Array.from({ length: 10 }, (_, offset) => {
              const number = chapterIndex * 10 + offset + 1;
              const locked = number > highestUnlocked;
              const current = number === activeLevel;
              return <button key={number} type="button" className={`level-tile ${current ? "level-current" : ""} ${locked ? "level-locked" : "level-unlocked"}`} disabled={locked} aria-label={locked ? `Level ${number}, locked; complete level ${number - 1} first` : `Play level ${number}${current ? ", current level" : ""}`} aria-current={current ? "step" : undefined} title={locked ? `Complete level ${number - 1} to unlock` : `Play level ${number}`} onClick={() => startLevel(number)}><span>{locked ? <LockKeyhole size={13} /> : String(number).padStart(2, "0")}</span></button>;
            })}</div>
          </section>;
        })}</div>
        <div className="level-dialog-foot"><LockKeyhole size={14} /><span>Locked levels open one at a time after a win.</span></div>
      </section></div>}

      {tutorialOpen && <div className="modal-backdrop tutorial-backdrop" role="presentation"><section className="tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <button className="modal-close" onClick={finishTutorial} aria-label="Close tutorial"><X size={18} /></button>
        <div className="tutorial-brand"><span className="tutorial-brand-mark"><MoonStar size={20} /></span><span><small>WELCOME TO</small><b>THE LAST RELIC</b></span></div>
        <div className="tutorial-progress-dots">{tutorialSteps.map((_, index) => <span key={index} className={index === tutorialStep ? "current" : index < tutorialStep ? "visited" : ""} />)}</div>
        <div className="tutorial-icon"><TutorialIcon size={27} /></div>
        <span className="tutorial-step-label">STEP {tutorialStep + 1} OF {tutorialSteps.length} <i>·</i> {tutorial.tag}</span>
        <h1 id="tutorial-title">{tutorial.title}</h1>
        <p>{tutorial.copy}</p>
        {tutorialStep === 0 && <div className="tutorial-reward"><Heart size={16} fill="currentColor" /> <span>Start with <b>3 hearts</b></span><span className="reward-divider" /><KeyRound size={15} /><span>Find a <b>key</b></span><span className="reward-divider" /><Sparkles size={15} /><span><b>3 relics</b></span></div>}
        {tutorialStep === 2 && <div className="algo-note"><BookOpen size={16} /><span><b>Depth-First Search</b><small>Search deep, then backtrack.</small></span></div>}
        {tutorialStep === 3 && <div className="algo-note ghost-algo-note"><Ghost size={16} /><span><b>Breadth-First Search</b><small>The ghost follows a shortest path.</small></span></div>}
        <div className="tutorial-actions"><button className="skip-button" onClick={finishTutorial}>Skip tutorial</button>{tutorialStep === tutorialSteps.length - 1 ? <button className="primary-button" onClick={finishTutorial}>Start the hunt <ArrowRight size={17} /></button> : <button className="primary-button" onClick={() => setTutorialStep((step) => Math.min(step + 1, tutorialSteps.length - 1))}>Next <ArrowRight size={17} /></button>}</div>
      </section></div>}

      {accountOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountOpen(false); }}><section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <button className="modal-close" onClick={() => setAccountOpen(false)} aria-label="Close account panel"><X size={18} /></button>
        <div className="account-dialog-head"><span className="account-dialog-icon">{isAuthenticated ? <ShieldCheck size={22} /> : <Ghost size={22} />}</span><span><small>PLAYER PROFILE</small><h2 id="account-title">{isAuthenticated ? displayName : "Save your adventures"}</h2></span></div>
        {isAuthenticated ? <>
          <p className="account-intro">Your best and most recent hunts are saved to your signed-in player account.</p>
          <div className="history-heading"><strong>Recent adventures</strong><span>{history.length} saved</span></div>
          {historyQuery.isLoading ? <div className="history-empty">Loading your adventure history…</div> : historyQuery.isError ? <div className="history-empty">History could not load. Please try again in a moment.</div> : history.length === 0 ? <div className="history-empty"><Trophy size={21} /><span>Your hunt history will appear here.</span><small>Finish a run to save your first result.</small></div> : <div className="history-list">{history.map((run) => <div className="history-item" key={run.id}><span className={`history-result ${run.result === "won" ? "history-won" : "history-lost"}`}>{run.result === "won" ? <Trophy size={16} /> : <Skull size={16} />}</span><span className="history-details"><b>Level {String(run.level).padStart(2, "0")} · {run.result === "won" ? "Estate escaped" : "Hunt ended"}</b><small>{run.relicCount}/3 relics · {run.turns} steps · {formatDuration(run.durationSeconds)}</small></span><time>{(typeof run.createdAt === "string" ? new Date(run.createdAt) : run.createdAt).toLocaleDateString()}</time></div>)}</div>}
          {saveRun.isError && <p className="auth-message" role="alert">We couldn't sync this result to your account. It remains saved on this device.</p>}
          <button className="secondary-button signout-button" onClick={doLogout}><LogOut size={15} /> Sign out</button>
        </> : <>
          <p className="account-intro">Sign in to keep your finished runs with your player profile. Your history stays private to your account.</p>
          <div className="account-feature-list"><span><ShieldCheck size={15} /> Save wins and attempts</span><span><Trophy size={15} /> Pick up your history later</span></div>
          {authMessage && <p className="auth-message" role="alert">{authMessage}</p>}
          <button className="primary-button account-login-button" onClick={beginSignIn}><Ghost size={17} /> Sign in / create an account <ArrowRight size={17} /></button>
          <p className="provider-note">This preview uses its configured account sign-in. Separate email/phone verification is not yet connected; it needs an email/SMS identity provider and delivery settings.</p>
          {localRuns.length > 0 && <div className="guest-history-note">Your device currently remembers {localRuns.length} {localRuns.length === 1 ? "finished run" : "finished runs"} locally.</div>}
        </>}
      </section></div>}
    </main>
  );
}
