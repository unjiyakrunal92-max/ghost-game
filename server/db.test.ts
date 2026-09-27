import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  game_runs: [] as Array<Record<string, unknown>>,
  nextId: 0,
}));

vi.mock("mongodb", () => {
  class TestObjectId {
    private readonly id: string;
    constructor() { this.id = `test-object-id-${String(++state.nextId).padStart(6, "0")}`; }
    toHexString() { return this.id; }
  }

  const matches = (document: Record<string, unknown>, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([key, value]) => document[key] === value);

  class TestCursor {
    private order: Record<string, 1 | -1> = {};
    private count = Number.MAX_SAFE_INTEGER;
    private projection: Record<string, 0 | 1> | null = null;
    constructor(private documents: Record<string, unknown>[]) {}
    sort(order: Record<string, 1 | -1>) { this.order = order; return this; }
    limit(count: number) { this.count = count; return this; }
    project<T>(projection: Record<string, 0 | 1>) { this.projection = projection; return this as TestCursor; }
    private result() {
      const sorted = [...this.documents].sort((a, b) => {
        for (const [key, direction] of Object.entries(this.order)) {
          const av = a[key] instanceof Date ? (a[key] as Date).getTime() : a[key];
          const bv = b[key] instanceof Date ? (b[key] as Date).getTime() : b[key];
          if (av === bv) continue;
          return ((av as number | string) < (bv as number | string) ? -1 : 1) * direction;
        }
        return 0;
      }).slice(0, this.count);
      return this.projection
        ? sorted.map((doc) => Object.fromEntries(Object.keys(this.projection!).filter((key) => this.projection![key] === 1 && key in doc).map((key) => [key, doc[key]])))
        : sorted;
    }
    async toArray() { return this.result(); }
    async next() { return this.result()[0] ?? null; }
  }

  class TestCollection {
    constructor(private readonly name: "users" | "game_runs") {}
    async createIndex() { return "test-index"; }
    async updateOne(filter: Record<string, unknown>, update: { $set: Record<string, unknown>; $setOnInsert: Record<string, unknown> }) {
      const documents = state[this.name];
      const current = documents.find((doc) => matches(doc, filter));
      if (current) Object.assign(current, update.$set);
      else documents.push({ ...update.$setOnInsert, ...filter, ...update.$set, _id: new TestObjectId() });
      return { acknowledged: true };
    }
    async findOne(filter: Record<string, unknown>) {
      return state[this.name].find((doc) => matches(doc, filter)) ?? null;
    }
    async insertOne(document: Record<string, unknown>) {
      state[this.name].push({ ...document, _id: new TestObjectId() });
      return { acknowledged: true, insertedId: new TestObjectId() };
    }
    find(filter: Record<string, unknown>) {
      return new TestCursor(state[this.name].filter((doc) => matches(doc, filter)));
    }
  }

  class TestMongoClient {
    constructor(_uri: string, _options?: unknown) {}
    async connect() { return this; }
    db(name = "the_last_relic") {
      return {
        databaseName: name,
        command: async () => ({ ok: 1 }),
        collection: (collectionName: "users" | "game_runs") => new TestCollection(collectionName),
      };
    }
    async close() {}
  }

  return { MongoClient: TestMongoClient, ObjectId: TestObjectId };
});

import { closeDb, getHighestUnlockedLevel, getUserByOpenId, listGameRuns, saveGameRun, upsertUser } from "./db";

beforeEach(async () => {
  await closeDb();
  state.users.length = 0;
  state.game_runs.length = 0;
  state.nextId = 0;
});

describe("MongoDB persistence adapter", () => {
  it("upserts users without erasing profile fields omitted by a later sign-in", async () => {
    const signedIn = new Date("2026-09-27T12:00:00.000Z");
    await upsertUser({ openId: "provider-user-1", name: "Mourningwood Player", email: "player@example.com", loginMethod: "oauth", lastSignedIn: signedIn });
    await upsertUser({ openId: "provider-user-1", lastSignedIn: new Date("2026-09-28T12:00:00.000Z") });
    const user = await getUserByOpenId("provider-user-1");

    expect(user).toMatchObject({ openId: "provider-user-1", name: "Mourningwood Player", email: "player@example.com", loginMethod: "oauth" });
    expect(user?.id).toMatch(/^test-object-id-/);
    expect(user?.lastSignedIn).toEqual(new Date("2026-09-28T12:00:00.000Z"));
  });

  it("lists only the requested player's latest 20 runs and computes progress from wins only", async () => {
    for (let level = 1; level <= 25; level++) {
      await saveGameRun({ userId: "player-one", level, result: level === 25 ? "lost" : "won", relicCount: 3, turns: 20 + level, livesRemaining: 2, durationSeconds: 60, createdAt: new Date(1_800_000_000_000 + level * 1000) });
    }
    await saveGameRun({ userId: "player-two", level: 50, result: "won", relicCount: 3, turns: 80, livesRemaining: 1, durationSeconds: 120 });

    const runs = await listGameRuns("player-one");
    expect(runs).toHaveLength(20);
    expect(runs[0]).toMatchObject({ level: 25, result: "lost" });
    expect(runs[0]).not.toHaveProperty("userId");
    expect(runs.at(-1)?.level).toBe(6);
    expect(await getHighestUnlockedLevel("player-one")).toBe(25);
    expect(await getHighestUnlockedLevel("player-two")).toBe(50);
    expect(await getHighestUnlockedLevel("new-player")).toBe(1);
  });
});
