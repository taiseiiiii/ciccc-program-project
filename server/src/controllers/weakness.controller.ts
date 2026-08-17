import type { Request, Response } from "express";
import { weaknessRepository } from "../repositories/weakness.repository";
import { HttpError } from "../utils/HttpError";
import { parseId } from "../utils/validate";

/**
 * HTTP layer for self-reported weaknesses.
 *
 * The list a climber sees is the shared presets plus their own labels. They
 * can add a label (POST, which reuses an existing match rather than creating a
 * duplicate) and delete their own; presets belong to nobody and cannot be
 * touched, which the DELETE reports as a 404 rather than a 403 — a preset is
 * not "yours to delete but forbidden", it is simply not one of your rows.
 */
export const weaknessController = {
  // GET /api/v1/weaknesses
  async list(req: Request, res: Response): Promise<void> {
    const weaknesses = await weaknessRepository.findAllForUser(
      req.user!.user_id,
    );
    res.json({ data: weaknesses });
  },

  // POST /api/v1/weaknesses   Body: { label: string }
  // Idempotent by design: submitting a label that already exists (as a preset
  // or as one of the climber's own) returns it instead of adding a near-copy.
  async create(req: Request, res: Response): Promise<void> {
    const { label } = req.body ?? {};
    if (typeof label !== "string" || label.trim() === "") {
      throw HttpError.badRequest("label is required and must be a non-empty string");
    }
    if (label.trim().length > 60) {
      throw HttpError.badRequest("label must be 60 characters or fewer");
    }

    const weakness = await weaknessRepository.findOrCreateByLabel(
      req.user!.user_id,
      label,
    );
    res.status(201).json({ data: weakness });
  },

  // DELETE /api/v1/weaknesses/:id
  async remove(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id!);
    const deleted = await weaknessRepository.removeCustom(id, req.user!.user_id);
    if (!deleted) {
      throw HttpError.notFound(`Weakness ${id} not found`);
    }
    res.status(204).send();
  },
};
