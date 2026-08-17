import type { Request, Response } from "express";
import { attemptRepository } from "../repositories/attempt.repository";
import { routeRepository } from "../repositories/route.repository";
import { taxonomyRepository } from "../repositories/taxonomy.repository";
import { weaknessRepository } from "../repositories/weakness.repository";
import { HttpError } from "../utils/HttpError";
import {
  optionalIdArray,
  optionalInt,
  optionalLabelArray,
  optionalString,
  parseId,
} from "../utils/validate";

const MAX_TRIES_PER_ROUTE = 200;

/**
 * HTTP layer for attempts — since migration 0007, one logged ROUTE rather than
 * one try. Ownership flows through the parent session: every read/write is
 * scoped to the token's user, and a row owned by someone else is
 * indistinguishable from a missing one (404).
 *
 * There is no POST here: climbs are created with their session via
 * POST /sessions, inside one transaction.
 */
export const attemptController = {
  // GET /api/v1/attempts        (optionally ?session_id=123)
  async list(req: Request, res: Response): Promise<void> {
    const sessionId =
      req.query.session_id === undefined
        ? undefined
        : parseId(String(req.query.session_id), "session_id");

    const attempts = await attemptRepository.findAll(
      req.user!.user_id,
      sessionId,
    );
    res.json({ data: attempts });
  },

  // GET /api/v1/attempts/:id
  async get(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const attempt = await attemptRepository.findById(id, req.user!.user_id);
    if (!attempt) {
      throw HttpError.notFound(`Attempt ${id} not found`);
    }
    res.json({ data: attempt });
  },

  // PATCH /api/v1/attempts/:id
  // Body: { route_id?, attempt_count?, send_count?, note?,
  //         wall_type_ids?, hold_type_ids?, weakness_type_ids?, weakness_labels? }
  //
  // `is_success` is not accepted: it is generated from send_count, so a climb
  // is marked sent by saying how many times it went.
  async update(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const {
      route_id,
      attempt_count,
      send_count,
      note,
      wall_type_ids,
      hold_type_ids,
      weakness_type_ids,
      weakness_labels,
    } = req.body ?? {};

    if (req.body?.is_success !== undefined) {
      throw HttpError.badRequest(
        "is_success is derived from send_count — send send_count instead",
      );
    }

    const routeId = optionalInt(route_id, "route_id", { min: 1 });
    if (routeId === null) {
      throw HttpError.badRequest("route_id cannot be cleared");
    }
    const attemptCount = optionalInt(attempt_count, "attempt_count", {
      min: 1,
      max: MAX_TRIES_PER_ROUTE,
    });
    const sendCount = optionalInt(send_count, "send_count", {
      min: 0,
      max: MAX_TRIES_PER_ROUTE,
    });
    if (attemptCount === null || sendCount === null) {
      throw HttpError.badRequest("attempt_count and send_count cannot be cleared");
    }

    // Load the current row first: a PATCH that moves only one of the two
    // counts still has to satisfy sends <= tries against the other one.
    const current = await attemptRepository.findById(id, req.user!.user_id);
    if (!current) {
      throw HttpError.notFound(`Attempt ${id} not found`);
    }
    const nextTries = attemptCount ?? current.attempt_count;
    const nextSends = sendCount ?? current.send_count;
    if (nextSends > nextTries) {
      throw HttpError.badRequest(
        `sends (${nextSends}) cannot exceed tries (${nextTries})`,
      );
    }

    if (routeId !== undefined) {
      const route = await routeRepository.findById(routeId);
      if (!route) {
        throw HttpError.badRequest(
          `route_id ${routeId} does not reference an existing route`,
        );
      }
    }

    const wallIds = optionalIdArray(wall_type_ids, "wall_type_ids");
    const holdIds = optionalIdArray(hold_type_ids, "hold_type_ids");
    if (wallIds?.length || holdIds?.length) {
      const [knownWalls, knownHolds] = await Promise.all([
        taxonomyRepository.findExistingIds("wall_types", wallIds ?? []),
        taxonomyRepository.findExistingIds("hold_types", holdIds ?? []),
      ]);
      const unknownWall = wallIds?.find((wid) => !knownWalls.has(wid));
      if (unknownWall !== undefined) {
        throw HttpError.badRequest(`Unknown wall_type_id: ${unknownWall}`);
      }
      const unknownHold = holdIds?.find((hid) => !knownHolds.has(hid));
      if (unknownHold !== undefined) {
        throw HttpError.badRequest(`Unknown hold_type_id: ${unknownHold}`);
      }
    }

    const attempt = await attemptRepository.update(id, req.user!.user_id, {
      route_id: routeId,
      attempt_count: attemptCount,
      send_count: sendCount,
      note: optionalString(note, "note", 2000),
    });
    if (!attempt) {
      throw HttpError.notFound(`Attempt ${id} not found`);
    }

    // Tags hang off the route, weaknesses off the attempt. Both are replace-in-
    // full, so sending an empty array is how a climber clears them.
    if (wallIds !== undefined || holdIds !== undefined) {
      await attemptRepository.setRouteTags(attempt.route_id, {
        wallTypeIds: wallIds,
        holdTypeIds: holdIds,
      });
    }

    const weaknessIds = optionalIdArray(weakness_type_ids, "weakness_type_ids");
    const labels = optionalLabelArray(weakness_labels, "weakness_labels");
    if (weaknessIds !== undefined || labels !== undefined) {
      const resolved = [...(weaknessIds ?? [])];
      for (const label of labels ?? []) {
        const row = await weaknessRepository.findOrCreateByLabel(
          req.user!.user_id,
          label,
        );
        resolved.push(row.weakness_type_id);
      }
      await weaknessRepository.setForAttempt(id, [...new Set(resolved)]);
    }

    // Re-read so the response reflects the tag writes above.
    res.json({ data: await attemptRepository.findById(id, req.user!.user_id) });
  },

  // DELETE /api/v1/attempts/:id
  async remove(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const deleted = await attemptRepository.remove(id, req.user!.user_id);
    if (!deleted) {
      throw HttpError.notFound(`Attempt ${id} not found`);
    }
    res.status(204).send();
  },
};
