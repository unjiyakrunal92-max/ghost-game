import "dotenv/config";
import { closeDb, getDb } from "./db";

async function main() {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    console.log(`[MongoDB] Connected successfully! Database: ${db.databaseName}`);
    const collections = await db.listCollections().toArray();
    console.log(`[MongoDB] Collections in ${db.databaseName}:`, collections.map(c => c.name));
    const userCount = await db.collection("users").countDocuments();
    console.log(`[MongoDB] Total registered users: ${userCount}`);
  } catch (error) {
    console.error("MongoDB is not reachable. Start the local service and check MONGODB_URI.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
