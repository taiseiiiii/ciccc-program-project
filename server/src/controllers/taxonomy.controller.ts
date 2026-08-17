import type { Request, Response } from "express";
import { taxonomyRepository } from "../repositories/taxonomy.repository";

/**
 * HTTP layer for the three tag vocabularies the forms render as buttons:
 * wall angles, hold types and body parts.
 *
 * All read-only master data, created by migrations 0005 and 0010 — same
 * treatment as grades. Clients cache these indefinitely; they only change when
 * a migration changes them.
 */
export const taxonomyController = {
  // GET /api/v1/wall-types
  async listWallTypes(_req: Request, res: Response): Promise<void> {
    res.json({ data: await taxonomyRepository.findWallTypes() });
  },

  // GET /api/v1/hold-types
  async listHoldTypes(_req: Request, res: Response): Promise<void> {
    res.json({ data: await taxonomyRepository.findHoldTypes() });
  },

  // GET /api/v1/body-parts
  async listBodyParts(_req: Request, res: Response): Promise<void> {
    res.json({ data: await taxonomyRepository.findBodyParts() });
  },
};
