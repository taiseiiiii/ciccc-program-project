import type { Request, Response } from "express";
import { injuryRepository } from "../repositories/injury.repository";
import { taxonomyRepository } from "../repositories/taxonomy.repository";
import { HttpError } from "../utils/HttpError";
import {
  optionalDate,
  optionalInt,
  optionalString,
  parseId,
  requireDate,
  requireInt,
} from "../utils/validate";
import { todayString } from "../utils/period";

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

function parseStatus(value: unknown, required: boolean): (typeof STATUSES)[number] | undefined {
  if (value === undefined) {
    if (required) throw HttpError.badRequest("status is required");
    return undefined;
  }
  if (!STATUSES.includes(value as (typeof STATUSES)[number])) {
    throw HttpError.badRequest(`status must be one of: ${STATUSES.join(", ")}`);
  }
  return value as (typeof STATUSES)[number];
}

function parseSide(value: unknown): (typeof SIDES)[number] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!SIDES.includes(value as (typeof SIDES)[number])) {
    throw HttpError.badRequest(`side must be one of: ${SIDES.join(", ")}`);
  }
  return value as (typeof SIDES)[number];
}

/** Reject a body_part_id that does not exist, so the FK never surfaces as a 500. */
async function assertBodyPartExists(id: number): Promise<void> {
  const found = await taxonomyRepository.findExistingIds("body_parts", [id]);
  if (!found.has(id)) {
    throw HttpError.badRequest(`body_part_id ${id} does not reference a known body part`);
  }
}

export const injuryController = {
  // GET /api/v1/injuries        (optionally ?status=active|recovering|healed)
  async list(req: Request, res: Response): Promise<void> {
    const status = parseStatus(req.query.status, false);
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
    if (occurredOn > todayString()) {
      throw HttpError.badRequest("occurred_on cannot be in the future");
    }

    const injury = await injuryRepository.create({
      user_id: req.user!.user_id,
      body_part_id: bodyPartId,
      side: parseSide(side) ?? null,
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

    const injury = await injuryRepository.update(id, req.user!.user_id, {
      body_part_id: bodyPartId,
      side: parseSide(side),
      occurred_on: optionalDate(occurred_on, "occurred_on") ?? undefined,
      severity: optionalInt(severity, "severity", { min: 1, max: 5 }),
      description: optionalString(description, "description", 2000),
      status: parseStatus(status, false),
      resolved_on: optionalDate(resolved_on, "resolved_on"),
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
    res.status(201).json({ data: log });
  },
};
