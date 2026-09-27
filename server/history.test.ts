import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(user: TrpcContext["user"]): TrpcContext {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return ctx;
}

function createUser(): AuthenticatedUser {
  const now = new Date();
  return {
    id: "history-test-user-id",
    openId: "history-test-user",
    email: "history-test@example.com",
    name: "History Test",
    loginMethod: "test",
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

describe("history router", () => {
  it("requires authentication to read player history", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.history.list("history-test-user-id")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects cached-history requests for another account before database access", async () => {
    const caller = appRouter.createCaller(createContext(createUser()));
    await expect(caller.history.list("another-account-id")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.history.progress("another-account-id")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires authentication to save a completed run", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.history.save({
      level: 1,
      result: "won",
      relicCount: 3,
      turns: 24,
      livesRemaining: 2,
      durationSeconds: 90,
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("validates submitted run counters before reaching persistence", async () => {
    const caller = appRouter.createCaller(createContext(createUser()));
    await expect(caller.history.save({
      level: 1,
      result: "won",
      relicCount: 4,
      turns: 24,
      livesRemaining: 2,
      durationSeconds: 90,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
