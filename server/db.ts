import { MongoClient, ObjectId, type Db } from "mongodb";
import { ENV } from "./_core/env";
import type { GameRun, InsertGameRun, InsertUser, User } from "./models";

const USER_COLLECTION = "users";
const RUN_COLLECTION = "game_runs";

interface StoredUser extends User {
  _id?: ObjectId;
}

interface StoredGameRun extends GameRun {
  _id?: ObjectId;
}

let mongoClient: MongoClient | null = null;
let dbPromise: Promise<Db> | null = null;

/** Connect lazily so guest play and public routes do not require MongoDB. */
export async function getDb(): Promise<Db> {
  if (!dbPromise) {
    const uri = ENV.mongoUri;
    if (!uri) throw new Error("MONGODB_URI must be set outside local development.");
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 10 });
    mongoClient = client;
    dbPromise = client
      .connect()
      .then(async () => {
        const database = client.db(ENV.mongoDbName || "ghost_game_daa");
        await Promise.all([
          database.collection<StoredUser>(USER_COLLECTION).createIndex({ openId: 1 }, { unique: true }),
          database.collection<StoredGameRun>(RUN_COLLECTION).createIndex({ userId: 1, createdAt: -1, id: -1 }),
          database.collection<StoredGameRun>(RUN_COLLECTION).createIndex({ userId: 1, result: 1, level: -1 }),
        ]);
        return database;
      })
      .catch(async (error: unknown) => {
        if (mongoClient === client) {
          mongoClient = null;
          dbPromise = null;
        }
        await client.close().catch(() => undefined);
        console.error("[Database] Could not connect to MongoDB. Check MONGODB_URI and confirm the server is running.", error);
        throw error;
      });
  }
  return dbPromise;
}

function toUser(record: StoredUser): User {
  const { _id, ...user } = record;
  return { ...user, id: record.id || _id?.toHexString() || record.openId };
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  const now = new Date();
  const set: Partial<User> = { updatedAt: now };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) set[field] = user[field] ?? null;
  }
  if (user.lastSignedIn !== undefined) set.lastSignedIn = user.lastSignedIn;
  if (user.role !== undefined) set.role = user.role;
  else if (user.openId === ENV.ownerOpenId && ENV.ownerOpenId) set.role = "admin";

  const setOnInsert: Partial<User> = { id: new ObjectId().toHexString(), createdAt: now };
  if (user.name === undefined) setOnInsert.name = null;
  if (user.email === undefined) setOnInsert.email = null;
  if (user.loginMethod === undefined) setOnInsert.loginMethod = null;
  if (set.role === undefined) setOnInsert.role = "user";
  if (user.lastSignedIn === undefined) setOnInsert.lastSignedIn = now;

  await db.collection<StoredUser>(USER_COLLECTION).updateOne(
    { openId: user.openId },
    { $set: set, $setOnInsert: setOnInsert },
    { upsert: true },
  );
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  const record = await db.collection<StoredUser>(USER_COLLECTION).findOne({ openId });
  return record ? toUser(record) : undefined;
}

export async function saveGameRun(run: InsertGameRun): Promise<void> {
  const db = await getDb();
  await db.collection<StoredGameRun>(RUN_COLLECTION).insertOne({
    ...run,
    id: new ObjectId().toHexString(),
    createdAt: run.createdAt ?? new Date(),
  });
}

export async function listGameRuns(userId: string): Promise<Omit<GameRun, "userId">[]> {
  const db = await getDb();
  const records = await db
    .collection<StoredGameRun>(RUN_COLLECTION)
    .find({ userId })
    .sort({ createdAt: -1, id: -1 })
    .limit(20)
    .toArray();
  return records.map(({ _id, userId: _owner, ...run }) => run);
}

export async function getHighestUnlockedLevel(userId: string): Promise<number> {
  const db = await getDb();
  const latestWin = await db
    .collection<StoredGameRun>(RUN_COLLECTION)
    .find({ userId, result: "won" })
    .sort({ level: -1 })
    .project<{ level: number }>({ level: 1, _id: 0 })
    .limit(1)
    .next();
  return Math.min(50, Math.max(1, (latestWin?.level ?? 0) + 1));
}

export async function closeDb(): Promise<void> {
  if (!mongoClient) return;
  const client = mongoClient;
  mongoClient = null;
  dbPromise = null;
  await client.close();
}
