export interface TodayResponse {
  prompt: string;
  response: string;
  mood: "good" | "bad" | "neutral";
  sent_at: string;
  responded_at: string;
  goals: {
    goal1: GoalDetail;
    goal2: GoalDetail;
    goal3: GoalDetail;
  };
}

interface GoalDetail {
  name: string;
  clarity: number | null;
  done_today: boolean | null;
  good: string | null;
  bad: string | null;
}

export interface StatsResponse {
  streak: number;
  streak_is_best: boolean;
  total_entries: number;
  mood_counts_7d: { good: number; neutral: number; bad: number };
  goal_clarity_avg_7d: Record<string, { name: string; avg: number }>;
  goal_clarity_trend: Record<string, "up" | "down" | "flat">;
  weekly_moods: Array<{ date: string; mood: "good" | "bad" | "neutral" | null }>;
}

export interface EntryResponse {
  id: number;
  prompt: string;
  response: string;
  mood: "good" | "bad" | "neutral" | null;
  sent_at: string;
  responded_at: string | null;
  goal1_clarity: number | null;
  goal1_done_today: boolean | null;
  goal1_good: string | null;
  goal1_bad: string | null;
  goal2_clarity: number | null;
  goal2_done_today: boolean | null;
  goal2_good: string | null;
  goal2_bad: string | null;
  goal3_clarity: number | null;
  goal3_done_today: boolean | null;
  goal3_good: string | null;
  goal3_bad: string | null;
}

const BASE = "";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getToday(): Promise<TodayResponse | null> {
  return fetchJson<TodayResponse | null>("/api/today");
}

export async function getStats(): Promise<StatsResponse> {
  return fetchJson<StatsResponse>("/api/stats");
}

export async function getEntries(days = 7): Promise<EntryResponse[]> {
  return fetchJson<EntryResponse[]>(`/api/entries?days=${days}`);
}
