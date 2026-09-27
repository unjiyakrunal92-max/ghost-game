export const ENV = {
  appId: process.env.VITE_APP_ID || "ghost-game-app",
  cookieSecret: process.env.JWT_SECRET ?? "ghost-game-local-dev-secret",
  mongoUri: process.env.MONGODB_URI ?? (process.env.NODE_ENV === "production" ? "" : "mongodb://127.0.0.1:27017/ghost_game_daa"),
  mongoDbName: process.env.MONGODB_DB_NAME || "ghost_game_daa",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
