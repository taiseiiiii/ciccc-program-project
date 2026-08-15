import { completeWithSchema } from "./openai.service";
import type { ClimbingStats } from "../repositories/stats.repository";

/**
 * Domain layer for the AI coach: turns aggregated climbing stats into the
 * two report types the app stores — a performance analysis (performances
 * table) and a training plan (trainings table).
 *
 * Both prompts feed the model *pre-aggregated* stats, never raw rows: the
 * numbers the report cites are computed by SQL, so the model interprets data
 * instead of doing arithmetic (which it is bad at), and prompt size stays
 * flat no matter how much the user climbs.
 */

/** A goal as shown to the model — grade resolved to its label. */
export interface GoalSummary {
  target_grade: string;
  description: string | null;
  target_date: string | null;
  is_achieved: boolean;
}

/** What the model returns for a performance analysis. */
export interface PerformanceAnalysis {
  headline: string;
  grade_projection: string;
  strengths: string[];
  weaknesses: string[];
  focus_advice: string;
  report: string;
}

/** One recommended exercise inside a training plan. */
export interface TrainingDrill {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  frequency: string;
}

/** What the model returns for a training plan. */
export interface TrainingPlan {
  headline: string;
  focus: string;
  drills: TrainingDrill[];
  report: string;
}

const COACH_SYSTEM_PROMPT = `You are an experienced bouldering coach analyzing a climber's logged gym data.
Grades use the V-scale (V0 easiest to V17 hardest); "send" means completing a route, and the success rate is sends / attempts.
Ground every claim in the numbers and the climber's own notes — quote or paraphrase notes when they explain a pattern. Never invent data that is not in the input.
Be specific and actionable, in the encouraging but honest tone of a coach who wants the climber to improve. Address the climber as "you".
If the data is thin (few attempts), say so and keep conclusions proportionally modest.`;

// Structured-outputs strict mode: every property listed in `required`, and
// `additionalProperties: false` on every object.
const PERFORMANCE_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "One motivating sentence summarizing the period, e.g. 'Your slab game is peaking.'",
    },
    grade_projection: {
      type: "string",
      description: "The V-grade the climber is trending toward, e.g. 'V5' or 'V5+'. Base it on sends and success rates, at most 1-2 grades above the highest send.",
    },
    strengths: {
      type: "array",
      description: "2-3 short strength labels grounded in the data, e.g. 'Consistent on V3 overhangs'.",
      items: { type: "string" },
    },
    weaknesses: {
      type: "array",
      description: "2-3 short weakness labels grounded in the data.",
      items: { type: "string" },
    },
    focus_advice: {
      type: "string",
      description: "2-3 sentences: the single most valuable thing to focus on next and why.",
    },
    report: {
      type: "string",
      description: "The full performance report, 2-3 short paragraphs of plain text (no markdown headings).",
    },
  },
  required: ["headline", "grade_projection", "strengths", "weaknesses", "focus_advice", "report"],
  additionalProperties: false,
} as const;

const TRAINING_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "One sentence naming the theme of this training block.",
    },
    focus: {
      type: "string",
      description: "The overall focus of the plan and why it fits this climber's data, 1-2 sentences.",
    },
    drills: {
      type: "array",
      description: "3-5 recommended exercises, ordered most important first.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short drill name, e.g. 'Slab Technique Drills'." },
          description: {
            type: "string",
            description: "1-2 sentences: what to do and what it targets in this climber's data.",
          },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          frequency: { type: "string", description: "How often, e.g. '2x per week, 20 min'." },
        },
        required: ["title", "description", "priority", "frequency"],
        additionalProperties: false,
      },
    },
    report: {
      type: "string",
      description: "A short narrative tying the plan together, 1-2 paragraphs of plain text.",
    },
  },
  required: ["headline", "focus", "drills", "report"],
  additionalProperties: false,
} as const;

function describeInput(stats: ClimbingStats, goals: GoalSummary[]): string {
  return JSON.stringify({ stats, goals }, null, 2);
}

export const aiService = {
  /** Analyze one period (a day or a month) of logged climbing. */
  async generatePerformanceAnalysis(
    periodType: "daily" | "monthly",
    stats: ClimbingStats,
    goals: GoalSummary[],
  ): Promise<PerformanceAnalysis> {
    const periodLabel =
      periodType === "daily"
        ? `the session day ${stats.period_start}`
        : `the month ${stats.period_start} to ${stats.period_end}`;

    return completeWithSchema<PerformanceAnalysis>({
      system: COACH_SYSTEM_PROMPT,
      user: `Write a performance analysis of my climbing for ${periodLabel}.

My aggregated data for the period (stats) and my grade goals (goals):

${describeInput(stats, goals)}`,
      schemaName: "performance_analysis",
      schema: PERFORMANCE_SCHEMA as unknown as Record<string, unknown>,
    });
  },

  /** Recommend a training plan from recent activity (typically the last 30 days). */
  async generateTrainingPlan(
    stats: ClimbingStats,
    goals: GoalSummary[],
  ): Promise<TrainingPlan> {
    return completeWithSchema<TrainingPlan>({
      system: COACH_SYSTEM_PROMPT,
      user: `Design a training plan for the coming weeks based on my recent climbing (${stats.period_start} to ${stats.period_end}).
Target the weaknesses visible in the data, and pick drills that move me toward my goals.

My aggregated data for the period (stats) and my grade goals (goals):

${describeInput(stats, goals)}`,
      schemaName: "training_plan",
      schema: TRAINING_SCHEMA as unknown as Record<string, unknown>,
    });
  },
};
