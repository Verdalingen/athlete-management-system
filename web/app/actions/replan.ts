"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, getUserId } from "@/lib/supabase-server";

export type ReplanJobType = "daily" | "replan" | "seasonal" | "sync_kpis";
export type ReplanJobStatus = "pending" | "running" | "done" | "error";

export interface ReplanJob {
  id: string;
  type: ReplanJobType;
  status: ReplanJobStatus;
  error_message: string | null;
  coach_feedback: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export async function queueReplan(type: ReplanJobType, comment?: string): Promise<void> {
  const sb = createServerClient();
  const userId = await getUserId();
  if (!userId) throw new Error("Not authenticated");

  const { error } = await sb.from("replan_jobs").insert({
    user_id: userId,
    type,
    status: "pending",
    ...(comment?.trim() ? { user_comment: comment.trim() } : {}),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/plan");
}

export async function getReplanJobs(): Promise<ReplanJob[]> {
  const sb = createServerClient();
  const userId = await getUserId();
  if (!userId) return [];

  const { data } = await sb
    .from("replan_jobs")
    .select("id, type, status, error_message, coach_feedback, created_at, started_at, completed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  return (data ?? []) as ReplanJob[];
}
