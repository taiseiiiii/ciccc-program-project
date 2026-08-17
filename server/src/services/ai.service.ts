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
 *
 * Output is deliberately two-tiered. `summary` is the two lines the screen
 * actually shows; `detail` is the long version, kept behind a disclosure. A
 * coach whose advice has to be scrolled does not get read, but shortening the
 * prompt alone would throw the reasoning away — so both are asked for and the
 * UI chooses.
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
  summary: string;
  grade_projection: string;
  strengths: string[];
  weaknesses: string[];
  focus_advice: string;
  detail: string;
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
  summary: string;
  focus: string;
  drills: TrainingDrill[];
  detail: string;
}

/**
 * The line this app does not cross.
 *
 * Injury data is in the prompt so plans can route *around* a hurt body part.
 * That is load management, and it is useful. Naming a condition or handing out
 * a rehab protocol is medical advice, and a wrong one makes an injury worse —
 * so the model is told plainly not to, and `filterUnsafeDrills` below re-checks
 * the output rather than trusting that it complied.
 */
const MEDICAL_GUARDRAIL = `You are not a medical professional and this app does not give medical advice.
Never name a diagnosis or condition, never describe a treatment or rehab protocol, and never estimate a recovery timeline.
If the climber has a reported injury: do not program anything that loads the affected body part, say plainly that it is being worked around, and tell them to see a doctor or physiotherapist if pain persists or worsens.
Reducing load, resting, and training unaffected areas are the only injury-related recommendations you may make.`;

const COACH_SYSTEM_PROMPT = `You are an experienced bouldering coach analyzing a climber's logged gym data.
Grades use the V-scale (V0 easiest to V17 hardest); "send" means completing a route, and the success rate is sends / attempts.
An "attempt" is one try; a route may be tried many times in one session. A "flash" is a route sent on the first try.
Ground every claim in the numbers and the climber's own notes — quote or paraphrase notes when they explain a pattern. Never invent data that is not in the input.
The climber also tags routes by wall angle and hold type, and labels their own weaknesses. Where those tags disagree with the numbers, say so — that gap is the most useful thing you can tell them.
Be specific and actionable, in the encouraging but honest tone of a coach who wants the climber to improve. Address the climber as "you".
If the data is thin (few attempts), say so and keep conclusions proportionally modest.

${MEDICAL_GUARDRAIL}`;

// Structured-outputs strict mode: every property listed in `required`, and
// `additionalProperties: false` on every object.
const PERFORMANCE_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "EXACTLY two sentences, 160 characters maximum in total. This is the only text most climbers will read, so it must carry the single most important finding — not a greeting or a restatement of the numbers.",
    },
    grade_projection: {
      type: "string",
      description:
        "The V-grade the climber is trending toward, e.g. 'V5' or 'V5+'. Base it on sends and success rates, at most 1-2 grades above the highest send.",
    },
    strengths: {
      type: "array",
      description:
        "2-3 short strength labels grounded in the data, e.g. 'Consistent on V3 overhangs'. Six words maximum each.",
      items: { type: "string" },
    },
    weaknesses: {
      type: "array",
      description:
        "2-3 short weakness labels grounded in the data. Six words maximum each.",
      items: { type: "string" },
    },
    focus_advice: {
      type: "string",
      description:
        "ONE sentence: the single most valuable thing to focus on next.",
    },
    detail: {
      type: "string",
      description:
        "The full analysis, 2-3 short paragraphs of plain text (no markdown headings). Shown only when the climber asks for it, so this is where the reasoning and the caveats belong.",
    },
  },
  required: [
    "summary",
    "grade_projection",
    "strengths",
    "weaknesses",
    "focus_advice",
    "detail",
  ],
  additionalProperties: false,
} as const;

const TRAINING_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "EXACTLY two sentences, 160 characters maximum in total: what this block trains and why it is the right thing right now.",
    },
    focus: {
      type: "string",
      description:
        "ONE sentence naming the overall focus of the plan and why it fits this climber's data.",
    },
    drills: {
      type: "array",
      description:
        "3-5 recommended exercises, ordered most important first. If the climber has a reported injury, no drill may load the affected body part.",
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short drill name, e.g. 'Slab Technique Drills'.",
          },
          description: {
            type: "string",
            description:
              "1-2 sentences: what to do and what it targets in this climber's data.",
          },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          frequency: {
            type: "string",
            description: "How often, e.g. '2x per week, 20 min'.",
          },
        },
        required: ["title", "description", "priority", "frequency"],
        additionalProperties: false,
      },
    },
    detail: {
      type: "string",
      description:
        "A short narrative tying the plan together, 1-2 paragraphs of plain text. Shown only when the climber asks for it.",
    },
  },
  required: ["summary", "focus", "drills", "detail"],
  additionalProperties: false,
} as const;

/**
 * Words that mean a drill loads a given body part.
 *
 * This is a backstop, not the primary defence — the prompt is. It exists
 * because a plan that tells someone with a torn pulley to hangboard is the one
 * failure mode here that actually hurts somebody, and "the model was told not
 * to" is not a control. Deliberately over-broad: dropping a safe drill costs
 * the climber one suggestion, keeping an unsafe one costs them their season.
 */
const INJURY_KEYWORDS: Record<string, string[]> = {
  finger: [
    "finger", "fingerboard", "hangboard", "hang board", "campus",
    "crimp", "pinch", "pocket", "grip", "deadhang", "dead hang",
  ],
  wrist: ["wrist", "mantel", "mantle", "push-up", "push up", "plank", "press"],
  elbow: [
    "elbow", "lock-off", "lock off", "pull-up", "pull up", "campus",
    "bicep", "tricep", "curl",
  ],
  shoulder: [
    "shoulder", "overhead", "press", "dyno", "lock-off", "lock off",
    "ring", "pull-up", "pull up", "rotator",
  ],
  back: ["back", "deadlift", "row", "hinge", "pull-up", "pull up"],
  hip: ["hip", "high step", "high-step", "drop knee", "flexibility", "split"],
  knee: ["knee", "heel hook", "heel-hook", "drop knee", "squat", "lunge", "jump"],
  ankle: ["ankle", "jump", "drop", "landing", "calf", "hop"],
  other: [],
};

/**
 * Remove any drill that loads an injured body part, and say what was removed.
 *
 * Returns the surviving drills plus the titles dropped, so the caller can tell
 * the climber the plan was adjusted rather than silently handing them a
 * shorter list.
 */
export function filterUnsafeDrills(
  drills: TrainingDrill[],
  injuries: ClimbingStats["active_injuries"],
  bodyPartCodes: string[],
): { drills: TrainingDrill[]; removed: string[] } {
  if (injuries.length === 0 || bodyPartCodes.length === 0) {
    return { drills, removed: [] };
  }

  const banned = bodyPartCodes.flatMap((code) => INJURY_KEYWORDS[code] ?? []);
  if (banned.length === 0) return { drills, removed: [] };

  const kept: TrainingDrill[] = [];
  const removed: string[] = [];
  for (const drill of drills) {
    const haystack = `${drill.title} ${drill.description}`.toLowerCase();
    if (banned.some((word) => haystack.includes(word))) {
      removed.push(drill.title);
    } else {
      kept.push(drill);
    }
  }
  return { drills: kept, removed };
}

function describeInput(stats: ClimbingStats, goals: GoalSummary[]): string {
  return JSON.stringify({ stats, goals }, null, 2);
}

/** The injury paragraph, or nothing at all when the climber is healthy. */
function describeInjuries(stats: ClimbingStats): string {
  if (stats.active_injuries.length === 0) return "";
  const list = stats.active_injuries
    .map(
      (i) =>
        `${i.body_part} (${i.status}${i.severity ? `, severity ${i.severity}/5` : ""})`,
    )
    .join(", ");
  return `

IMPORTANT — I currently have these unhealed injuries: ${list}.
Do not program anything that loads them. Work around them and say so.`;
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

${describeInput(stats, goals)}${describeInjuries(stats)}`,
      schemaName: "performance_analysis",
      schema: PERFORMANCE_SCHEMA as unknown as Record<string, unknown>,
      // Two short display fields plus a few paragraphs — the old 1500 was
      // sized for a report that was all long-form.
      maxTokens: 900,
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

${describeInput(stats, goals)}${describeInjuries(stats)}`,
      schemaName: "training_plan",
      schema: TRAINING_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 1200,
    });
  },
};
