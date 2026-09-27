import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { MAX_LEVEL, isLevelUnlocked } from "@shared/levelProgress";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getHighestUnlockedLevel, listGameRuns, saveGameRun } from "./db";

const completedRunInput = z.object({
  level: z.number().int().min(1).max(MAX_LEVEL),
  result: z.enum(["won", "lost"]),
  relicCount: z.number().int().min(0).max(3),
  turns: z.number().int().min(0).max(2000),
  livesRemaining: z.number().int().min(0).max(3),
  durationSeconds: z.number().int().min(0).max(7200),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  history: router({
    list: protectedProcedure.input(z.string().min(1).max(128)).query(({ ctx, input }) => {
      if (input !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      return listGameRuns(ctx.user.id);
    }),
    progress: protectedProcedure.input(z.string().min(1).max(128)).query(({ ctx, input }) => {
      if (input !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      return getHighestUnlockedLevel(ctx.user.id);
    }),
    save: protectedProcedure.input(completedRunInput).mutation(async ({ ctx, input }) => {
      const highestUnlocked = await getHighestUnlockedLevel(ctx.user.id);
      if (!isLevelUnlocked(input.level, highestUnlocked)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Finish the previous level to unlock this one." });
      }
      await saveGameRun({ userId: ctx.user.id, ...input });
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
