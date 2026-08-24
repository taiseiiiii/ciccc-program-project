import type { Request, Response } from "express";
import { shareEventRepository } from "../repositories/shareEvent.repository";
import { requireEnum } from "../utils/validate";

/**
 * The share feature's counter.
 *
 * Cards and overlaid videos are produced entirely in the browser — canvas in,
 * file out — so unlike every other feature in this app, sharing leaves no trace
 * on the server unless the client says so. This endpoint is that trace.
 *
 * It exists because the templates and formats were shipped together on
 * purpose: nobody could say which of them climbers would use, and offering all
 * of them was the cheapest way to find out. That only pays off if the answer
 * gets recorded.
 *
 * What it is not: a record of what was shared. No route names, no gym, no
 * media — those stay in the browser. And `outcome: 'shared'` means the file
 * reached the OS share sheet, not that it reached Instagram; the Web Share API
 * never reports where the user sent it. Read these numbers as relative
 * popularity between templates, not as posts.
 */

const TEMPLATES = ["climb", "session", "month"] as const;
const FORMATS = ["image", "photo", "video"] as const;
const OUTCOMES = ["shared", "saved"] as const;

export const shareEventController = {
  // POST /api/v1/share-events
  // Body: { template, format, outcome }
  async create(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const event = await shareEventRepository.create({
      user_id: req.user!.user_id,
      template: requireEnum(body.template, "template", TEMPLATES),
      format: requireEnum(body.format, "format", FORMATS),
      outcome: requireEnum(body.outcome, "outcome", OUTCOMES),
    });

    res.status(201).json({ data: event });
  },
};
