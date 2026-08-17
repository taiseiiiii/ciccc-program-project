import type { Request, Response } from "express";
import {
  sessionRepository,
  type CreateSessionAttemptInput,
} from "../repositories/session.repository";
import { taxonomyRepository } from "../repositories/taxonomy.repository";
import { weaknessRepository } from "../repositories/weakness.repository";
import { HttpError } from "../utils/HttpError";
import {
  optionalDate,
  optionalIdArray,
  optionalInt,
  optionalLabelArray,
  optionalString,
  parseId,
  requireDate,
  requireInt,
} from "../utils/validate";

// A session longer than this is almost certainly a typo (24h in minutes).
const MAX_SESSION_MINUTES = 1440;
// One route, one session. Beyond this the climber is not logging, they are
// stress-testing the form.
const MAX_TRIES_PER_ROUTE = 200;

/**
 * Validate the tag ids on every nested climb in one round-trip per vocabulary.
 *
 * Checking them one climb at a time would mean a query per climb per
 * vocabulary; a 15-route session would issue 30 lookups to answer a question
 * that is two queries wide. An unknown id is the client's bug, so it is a 400
 * rather than a foreign-key violation surfacing as a 500.
 */
async function assertTagIdsExist(
  attempts: CreateSessionAttemptInput[],
): Promise<void> {
  const wallIds = [...new Set(attempts.flatMap((a) => a.wall_type_ids ?? []))];
  const holdIds = [...new Set(attempts.flatMap((a) => a.hold_type_ids ?? []))];

  const [knownWalls, knownHolds] = await Promise.all([
    taxonomyRepository.findExistingIds("wall_types", wallIds),
    taxonomyRepository.findExistingIds("hold_types", holdIds),
  ]);

  const unknownWall = wallIds.find((id) => !knownWalls.has(id));
  if (unknownWall !== undefined) {
    throw HttpError.badRequest(`Unknown wall_type_id: ${unknownWall}`);
  }
  const unknownHold = holdIds.find((id) => !knownHolds.has(id));
  if (unknownHold !== undefined) {
    throw HttpError.badRequest(`Unknown hold_type_id: ${unknownHold}`);
  }
}

/** Same check for weakness ids, which are per-user (presets + own labels). */
async function assertWeaknessIdsExist(
  attempts: CreateSessionAttemptInput[],
  userId: number,
): Promise<void> {
  const ids = [...new Set(attempts.flatMap((a) => a.weakness_type_ids ?? []))];
  if (ids.length === 0) return;

  const available = await weaknessRepository.findAllForUser(userId);
  const known = new Set(available.map((w) => w.weakness_type_id));
  const unknown = ids.find((id) => !known.has(id));
  if (unknown !== undefined) {
    throw HttpError.badRequest(`Unknown weakness_type_id: ${unknown}`);
  }
}

/**
 * HTTP layer for sessions. Keeps validation + status codes here and delegates
 * all persistence to the repository. All routes sit behind requireAuth, so
 * req.user is always set; the owner is taken from the token, never the body.
 * A row owned by someone else is indistinguishable from a missing one (404).
 */
export const sessionController = {
  // GET /api/v1/sessions
  async list(req: Request, res: Response): Promise<void> {
    const sessions = await sessionRepository.findAll(req.user!.user_id);
    res.json({ data: sessions });
  },

  // GET /api/v1/sessions/:id
  async get(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const session = await sessionRepository.findById(id, req.user!.user_id);
    if (!session) {
      throw HttpError.notFound(`Session ${id} not found`);
    }
    res.json({ data: session });
  },

  // POST /api/v1/sessions
  //
  // Takes the whole visit in one request. Each entry in `attempts` is one
  // route as climbed that day:
  //
  //   { grade_id, route_name?, attempt_count?, send_count?, note?,
  //     wall_type_ids?, hold_type_ids?, weakness_type_ids?, weakness_labels? }
  //
  // The session, its routes, its attempts and every tag are written in one
  // transaction, so a failure never leaves a partially saved session behind.
  async create(req: Request, res: Response): Promise<void> {
    const { visit_date, gym_name, duration_minutes, attempts } = req.body ?? {};

    const visitDate = requireDate(visit_date, "visit_date");
    const gymName = optionalString(gym_name, "gym_name", 150);
    const duration = optionalInt(duration_minutes, "duration_minutes", {
      min: 1,
      max: MAX_SESSION_MINUTES,
    });

    if (attempts !== undefined && !Array.isArray(attempts)) {
      throw HttpError.badRequest("attempts must be an array");
    }

    const attemptInputs: CreateSessionAttemptInput[] = [];
    for (const [i, raw] of (attempts ?? []).entries()) {
      const a = (raw ?? {}) as Record<string, unknown>;
      const gradeId = requireInt(a.grade_id, `attempts[${i}].grade_id`);

      // Default to the shape the old one-row-per-try model produced, so a
      // client that has not been updated still saves something coherent.
      const attemptCount =
        optionalInt(a.attempt_count, `attempts[${i}].attempt_count`, {
          min: 1,
          max: MAX_TRIES_PER_ROUTE,
        }) ?? 1;
      const sendCount =
        optionalInt(a.send_count, `attempts[${i}].send_count`, {
          min: 0,
          max: MAX_TRIES_PER_ROUTE,
        }) ?? 0;

      // The database enforces this too, but a CHECK violation reaches the
      // climber as an opaque 500 — name the offending route instead.
      if (sendCount > attemptCount) {
        throw HttpError.badRequest(
          `attempts[${i}]: sends (${sendCount}) cannot exceed tries (${attemptCount})`,
        );
      }

      attemptInputs.push({
        grade_id: gradeId,
        route_name: optionalString(a.route_name, `attempts[${i}].route_name`, 150),
        attempt_count: attemptCount,
        send_count: sendCount,
        note: optionalString(a.note, `attempts[${i}].note`, 2000),
        wall_type_ids: optionalIdArray(a.wall_type_ids, `attempts[${i}].wall_type_ids`),
        hold_type_ids: optionalIdArray(a.hold_type_ids, `attempts[${i}].hold_type_ids`),
        weakness_type_ids: optionalIdArray(
          a.weakness_type_ids,
          `attempts[${i}].weakness_type_ids`,
        ),
        weakness_labels: optionalLabelArray(
          a.weakness_labels,
          `attempts[${i}].weakness_labels`,
        ),
      });
    }

    await assertTagIdsExist(attemptInputs);
    await assertWeaknessIdsExist(attemptInputs, req.user!.user_id);

    const session = await sessionRepository.createWithAttempts(
      {
        user_id: req.user!.user_id,
        visit_date: visitDate,
        gym_name: gymName,
        duration_minutes: duration,
      },
      attemptInputs,
    );
    res.status(201).json({ data: session });
  },

  // PATCH /api/v1/sessions/:id
  async update(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const { visit_date, gym_name, duration_minutes } = req.body ?? {};

    const visitDate = optionalDate(visit_date, "visit_date");
    if (visitDate === null) {
      throw HttpError.badRequest("visit_date cannot be cleared");
    }

    const session = await sessionRepository.update(id, req.user!.user_id, {
      visit_date: visitDate,
      gym_name: optionalString(gym_name, "gym_name", 150),
      duration_minutes: optionalInt(duration_minutes, "duration_minutes", {
        min: 1,
        max: MAX_SESSION_MINUTES,
      }),
    });
    if (!session) {
      throw HttpError.notFound(`Session ${id} not found`);
    }
    res.json({ data: session });
  },

  // DELETE /api/v1/sessions/:id
  async remove(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const deleted = await sessionRepository.remove(id, req.user!.user_id);
    if (!deleted) {
      throw HttpError.notFound(`Session ${id} not found`);
    }
    res.status(204).send();
  },
};
