import { createHash } from "crypto";
import express from "express";
import type { Express } from "express";
import { COOKIE_NAME, TEN_HOURS_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import * as db from "../db";

/**
 * Simple hash-based password hashing using Node.js built-in crypto.
 * Uses SHA-256 with a salt prefix. No extra npm package needed.
 */
function hashPassword(password: string): string {
  const salt = createHash("sha256")
    .update(Date.now().toString() + Math.random().toString())
    .digest("hex")
    .slice(0, 16);
  const hash = createHash("sha256")
    .update(salt + password)
    .digest("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = createHash("sha256")
    .update(salt + password)
    .digest("hex");
  return check === hash;
}

export function registerLocalAuthRoutes(app: Express) {
  app.use(express.json());

  /**
   * POST /api/auth/register
   * Body: { email, password, name }
   */
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, name } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      const normalizedEmail = String(email).trim().toLowerCase();

      if (password.length < 6) {
        res.status(400).json({ error: "Password must be at least 6 characters" });
        return;
      }

      const database = await db.getDb();

      // Check if user already exists
      const existing = await database.collection("users").findOne({ email: normalizedEmail });
      if (existing) {
        res.status(409).json({ error: "A user with this email already exists" });
        return;
      }

      const openId = `local_${createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 16)}`;
      const hashedPassword = hashPassword(password);

      // Store password hash in user_credentials collection
      await database.collection("user_credentials").updateOne(
        { openId },
        { $set: { openId, email: normalizedEmail, passwordHash: hashedPassword, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );

      // Create user in the main users collection
      const displayName = name ? String(name).trim() : normalizedEmail.split("@")[0];
      await db.upsertUser({
        openId,
        name: displayName,
        email: normalizedEmail,
        loginMethod: "email",
        lastSignedIn: new Date(),
      });

      // Create session token with 10hr expiration
      const sessionToken = await sdk.createSessionToken(openId, {
        name: displayName,
        expiresInMs: TEN_HOURS_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: TEN_HOURS_MS });

      const user = await db.getUserByOpenId(openId);
      res.json({ success: true, user });
    } catch (error) {
      console.error("[Auth] Register failed:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Registration failed. Please try again." });
    }
  });

  /**
   * POST /api/auth/login
   * Body: { email, password }
   */
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const database = await db.getDb();
      const credentials = await database.collection("user_credentials").findOne({ email: normalizedEmail });

      if (!credentials) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      if (!verifyPassword(password, credentials.passwordHash)) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const openId = credentials.openId as string;
      const userRecord = await db.getUserByOpenId(openId);
      const displayName = userRecord?.name || normalizedEmail.split("@")[0];

      // Update last sign-in
      await db.upsertUser({
        openId,
        lastSignedIn: new Date(),
      });

      // Create session token with 10hr expiration
      const sessionToken = await sdk.createSessionToken(openId, {
        name: displayName,
        expiresInMs: TEN_HOURS_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: TEN_HOURS_MS });

      const user = await db.getUserByOpenId(openId);
      res.json({ success: true, user });
    } catch (error) {
      console.error("[Auth] Login failed:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Login failed. Please try again." });
    }
  });

  /**
   * GET /api/auth/me
   * Returns current logged-in user or null
   */
  app.get("/api/auth/me", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user });
    } catch {
      res.json({ user: null });
    }
  });

  /**
   * POST /api/auth/logout
   */
  app.post("/api/auth/logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });
}
