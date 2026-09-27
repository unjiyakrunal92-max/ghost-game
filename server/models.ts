export type UserRole = "user" | "admin";

export type User = {
  id: string;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

export type InsertUser = {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: UserRole;
  lastSignedIn?: Date;
};

export type GameRunResult = "won" | "lost";

export type GameRun = {
  id: string;
  userId: string;
  level: number;
  result: GameRunResult;
  relicCount: number;
  turns: number;
  livesRemaining: number;
  durationSeconds: number;
  createdAt: Date;
};

export type InsertGameRun = Omit<GameRun, "id" | "createdAt"> & { createdAt?: Date };
