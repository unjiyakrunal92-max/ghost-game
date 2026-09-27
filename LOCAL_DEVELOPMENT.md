# Local development: MongoDB

The app's user records and completed-game history are stored in MongoDB. The default local connection is `mongodb://127.0.0.1:27017/the_last_relic`, using `127.0.0.1` to avoid IPv6 `localhost` resolution differences.

## Start MongoDB with Docker

1. Install Docker Desktop (Windows/macOS) or Docker Engine plus the Compose plugin (Linux).
2. From the project root, run:

   ```bash
   pnpm install
   pnpm mongo:up
   pnpm db:check
   pnpm dev
   ```

3. Open the localhost URL printed by Vite/Express (normally `http://localhost:3000`).
4. Stop the local database when finished with `pnpm mongo:down`. Your local records remain in the named `last-relic-mongo-data` volume; `docker compose down -v` deletes that local database volume.

The MongoDB container is bound to `127.0.0.1:27017`, not exposed to your network, and uses no credentials because the Compose file is for local development only. For a native MongoDB Community Server installation instead, start the local `mongod` service and use the same URI.

## Environment variables

- `MONGODB_URI`: optional Mongo connection string. Defaults in code to the local URI above if omitted; set this in your shell only if you need a different server.
- `MONGODB_DB_NAME`: optional database name override; defaults to the database in the URI (`the_last_relic`).

For example, a custom local instance can be selected for one terminal session with `MONGODB_URI=mongodb://127.0.0.1:27018/the_last_relic pnpm dev` on Linux/macOS, or by setting the same environment variable in PowerShell on Windows.

The app creates its `users` and `game_runs` collections and required indexes on first successful connection. No SQL schema push or migration command is needed.

## Hosted preview/deployment

`127.0.0.1` refers to the machine running the app. In a hosted deployment it would refer to the app container itself, not your laptop. To use accounts and history in a hosted deployment, set `MONGODB_URI` to a reachable MongoDB deployment (for example, a properly network-restricted MongoDB Atlas cluster) and optionally set `MONGODB_DB_NAME`. Keep credentials in the hosting environment's secrets, not in source control. A local MongoDB database is separate from the earlier managed SQL database; this code change does not copy existing SQL records into MongoDB.
