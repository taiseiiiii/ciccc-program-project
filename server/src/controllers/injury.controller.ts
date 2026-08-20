import type { Request, Response } from "express";
import { injuryRepository } from "../repositories/injury.repository";
import { taxonomyRepository } from "../repositories/taxonomy.repository";
import { HttpError } from "../utils/HttpError";
import {
  optionalDate,
  optionalEnum,
  optionalInt,
  optionalString,
  parseId,
  requireDate,
  requireInt,
} from "../utils/validate";
import { dayAfter, todayString } from "../utils/period";

/**
 * HTTP layer for injuries and their daily check-ins.
 *
 * What this endpoint is for: recording that something hurts, tracking whether
 * it is getting better, and telling the AI coach which body parts a training
 * plan has to avoid. What it is deliberately not for: diagnosis, treatment or
 * recovery estimates — see migration 0010 and the guardrail in ai.service.ts.
 *
 * Ownership works the usual way: injuries are scoped by user_id, and logs
 * reach ownership through their parent injury, so a log for someone else's
 * injury is a 404.
 */

const STATUSES = ["active", "recovering", "healed"] as const;
const SIDES = ["left", "right", "both"] as const;

/** Reject a body_part_id that does not exist, so the FK never surfaces as a 500. */
async function assertBodyPartExists(id: number): Promise<void> {
  const found = await taxonomyRepository.findExistingIds("body_parts", [id]);
  if (!found.has(id)) {
    throw HttpError.badRequest(`body_part_id ${id} does not reference a known body part`);
  }
}

/**
 * An injury cannot have started tomorrow. Checked on create and on update:
 * only create used to check it, so an edit could quietly move an injury into
 * the future and take the "sore for N days" counter with it.
 *
 * The bound is the server's tomorrow, not its today, because "today" is not one
 * date. The client sends its own local date and the server's can legitimately
 * be a day behind it — a climber in Tokyo logging a Tuesday injury against a
 * server still on Monday is not sending a future date, and refusing them would
 * be a bug that only appears in some timezones. One day of slack covers every
 * real offset; it does not let anyone log next week.
 */
function assertNotFuture(date: string, field: string): void {
  if (date > dayAfter(todayString())) {
    throw HttpError.badRequest(`${field} cannot be in the future`);
  }
}

export const injuryController = {
  // GET /api/v1/injuries        (optionally ?status=active|recovering|healed)
  async list(req: Request, res: Response): Promise<void> {
    const status = optionalEnum(req.query.status, "status", STATUSES) ?? undefined;
    const injuries = await injuryRepository.findAll(req.user!.user_id, { status });
    res.json({ data: injuries });
  },

  // GET /api/v1/injuries/:id
  async get(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const injury = await injuryRepository.findById(id, req.user!.user_id);
    if (!injury) throw HttpError.notFound(`Injury ${id} not found`);
    res.json({ data: injury });
  },

  // POST /api/v1/injuries
  // Body: { body_part_id, occurred_on, side?, severity?, description? }
  async create(req: Request, res: Response): Promise<void> {
    const { body_part_id, occurred_on, side, severity, description } = req.body ?? {};

    const bodyPartId = requireInt(body_part_id, "body_part_id");
    await assertBodyPartExists(bodyPartId);

    const occurredOn = requireDate(occurred_on, "occurred_on");
    assertNotFuture(occurredOn, "occurred_on");

    const injury = await injuryRepository.create({
      user_id: req.user!.user_id,
      body_part_id: bodyPartId,
      side: optionalEnum(side, "side", SIDES) ?? null,
      occurred_on: occurredOn,
      severity: optionalInt(severity, "severity", { min: 1, max: 5 }) ?? null,
      description: optionalString(description, "description", 2000) ?? null,
    });
    res.status(201).json({ data: injury });
  },

  // PATCH /api/v1/injuries/:id
  // Marking one healed fills in resolved_on automatically; reopening clears it.
  async update(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const { body_part_id, occurred_on, side, severity, description, status, resolved_on } =
      req.body ?? {};

    let bodyPartId: number | undefined;
    if (body_part_id !== undefined) {
      bodyPartId = requireInt(body_part_id, "body_part_id");
      await assertBodyPartExists(bodyPartId);
    }

    // `?? undefined` on the dates: occurred_on is NOT NULL, so an explicit null
    // means "leave it alone" rather than "clear it".
    const occurredOn = optionalDate(occurred_on, "occurred_on") ?? undefined;
    if (occurredOn !== undefined) assertNotFuture(occurredOn, "occurred_on");

    const resolvedOn = optionalDate(resolved_on, "resolved_on");
    if (typeof resolvedOn === "string") assertNotFuture(resolvedOn, "resolved_on");

    const injury = await injuryRepository.update(id, req.user!.user_id, {
      body_part_id: bodyPartId,
      side: optionalEnum(side, "side", SIDES),
      occurred_on: occurredOn,
      severity: optionalInt(severity, "severity", { min: 1, max: 5 }),
      description: optionalString(description, "description", 2000),
      status: optionalEnum(status, "status", STATUSES) ?? undefined,
      resolved_on: resolvedOn,
    });
    if (!injury) throw HttpError.notFound(`Injury ${id} not found`);
    res.json({ data: injury });
  },

  // DELETE /api/v1/injuries/:id
  async remove(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const deleted = await injuryRepository.remove(id, req.user!.user_id);
    if (!deleted) throw HttpError.notFound(`Injury ${id} not found`);
    res.status(204).send();
  },

  // GET /api/v1/injuries/:id/logs
  async listLogs(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const injury = await injuryRepository.findById(id, req.user!.user_id);
    if (!injury) throw HttpError.notFound(`Injury ${id} not found`);
    res.json({ data: await injuryRepository.findLogs(id, req.user!.user_id) });
  },

  // POST /api/v1/injuries/:id/logs
  // Body: { pain_level: 0-10, logged_on?: 'YYYY-MM-DD', note? }
  // One entry per day: re-posting the same date corrects it rather than adding
  // a second reading, so a climber can fix a mis-tap without a delete first.
  // Which is why the status code depends on what actually happened — 201 for a
  // new day, 200 when today's reading was corrected.
  async createLog(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const { pain_level, logged_on, note } = req.body ?? {};

    if (
      typeof pain_level !== "number" ||
      !Number.isInteger(pain_level) ||
      pain_level < 0 ||
      pain_level > 10
    ) {
      throw HttpError.badRequest(
        "pain_level is required and must be an integer between 0 and 10",
      );
    }
    // The client sends its local date: the server's today can be a different
    // day in the climber's timezone.
    const loggedOn = optionalDate(logged_on, "logged_on") ?? todayString();

    const log = await injuryRepository.upsertLog(id, req.user!.user_id, {
      logged_on: loggedOn,
      pain_level,
      note: optionalString(note, "note", 1000) ?? null,
    });
    if (!log) throw HttpError.notFound(`Injury ${id} not found`);
    res.status(log.created ? 201 : 200).json({ data: log.log });
  },
};
