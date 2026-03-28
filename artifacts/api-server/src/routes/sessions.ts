import { Router, type IRouter } from "express";
import { db, sessionsTable } from "@workspace/db";
import { eq, countDistinct, count, avg } from "drizzle-orm";
import { SubmitFeedbackBody } from "@workspace/api-zod";

const VALID_MODES = ["focus", "sleep", "yoga", "panic"] as const;
type Mode = typeof VALID_MODES[number];

function parseSessionBody(body: unknown): { userId: string; mode: Mode; startedAt: Date; endedAt: Date; durationSeconds: number } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.userId !== "string") return null;
  if (!VALID_MODES.includes(b.mode as Mode)) return null;
  const startedAt = new Date(b.startedAt as string);
  const endedAt = new Date(b.endedAt as string);
  if (isNaN(startedAt.getTime()) || isNaN(endedAt.getTime())) return null;
  if (typeof b.durationSeconds !== "number") return null;
  return { userId: b.userId, mode: b.mode as Mode, startedAt, endedAt, durationSeconds: b.durationSeconds };
}

const router: IRouter = Router();

router.post("/sessions", async (req, res) => {
  const parsed = parseSessionBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { userId, mode, startedAt, endedAt, durationSeconds } = parsed;
  const [session] = await db
    .insert(sessionsTable)
    .values({
      userId,
      mode,
      startedAt: new Date(startedAt),
      endedAt: new Date(endedAt),
      durationSeconds,
    })
    .returning();
  res.status(201).json(session);
});

router.post("/sessions/feedback", async (req, res) => {
  const parsed = SubmitFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { sessionId, ratingHelpful, wouldRecommend } = parsed.data;
  const [updated] = await db
    .update(sessionsTable)
    .set({ ratingHelpful, wouldRecommend })
    .where(eq(sessionsTable.id, sessionId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(updated);
});

router.get("/stats", async (req, res) => {
  const [usersResult] = await db
    .select({ totalUsers: countDistinct(sessionsTable.userId) })
    .from(sessionsTable);

  const [sessionsResult] = await db
    .select({ totalSessions: count() })
    .from(sessionsTable);

  const [avgResult] = await db
    .select({ avg: avg(sessionsTable.durationSeconds) })
    .from(sessionsTable);

  const [recResult] = await db
    .select({ totalRec: count() })
    .from(sessionsTable)
    .where(eq(sessionsTable.wouldRecommend, true));

  const totalSessions = Number(sessionsResult?.totalSessions ?? 0);
  const totalRecommended = Number(recResult?.totalRec ?? 0);

  res.json({
    totalUsers: Number(usersResult?.totalUsers ?? 0),
    totalSessions,
    avgDurationSeconds: Number(avgResult?.avg ?? 0),
    recommendPercent: totalSessions > 0 ? (totalRecommended / totalSessions) * 100 : 0,
  });
});

export default router;
