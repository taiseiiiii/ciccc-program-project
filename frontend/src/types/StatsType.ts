/** A grade referred to from a statistic — the label plus its rank on the scale. */
export interface GradeRef {
  grade_name: string; // "V0" .. "V17"
  level: number; // 0..17
}

/** One calendar day. Days with no activity are present with zeros. */
export interface DailyStat {
  date: string; // YYYY-MM-DD
  sessions: number;
  attempts: number;
  cumulativeSessions: number; // running total from the 1st of the month
}

/** Attempt/send counts for one grade. Only grades actually attempted appear. */
export interface GradeStat {
  grade_id: number;
  grade_name: string;
  level: number;
  attempts: number;
  sends: number;
  fails: number;
  successRate: number; // 0..100
}

export interface StatsSummary {
  sessions: number;
  attempts: number;
  sends: number;
  sessionsChange: number; // vs the previous month; negative when activity dropped
  sendsChange: number;
  avgAttemptsPerSession: number; // 0 in a month with no sessions
  highestGrade: GradeRef | null; // hardest grade sent this month
  nextGrade: GradeRef | null; // attempted above `highestGrade` but not yet sent
}

/** Response body of GET /stats?month=YYYY-MM. */
export default interface MonthlyStats {
  month: string; // YYYY-MM
  summary: StatsSummary;
  daily: DailyStat[];
  byGrade: GradeStat[];
}
