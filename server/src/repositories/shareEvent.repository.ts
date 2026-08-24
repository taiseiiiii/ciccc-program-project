import { query } from "../db/pool";

/** Which card was exported. */
export type ShareTemplate = "climb" | "session" | "month";
/**
 * What was produced: the card the app drew, the climber's own photo with the
 * overlay on it, or their video with it burned in.
 */
export type ShareFormat = "image" | "photo" | "video";
/** Handed to the OS share sheet, or saved to the device. */
export type ShareOutcome = "shared" | "saved";

/** A row in `share_events`. Append-only — nothing ever updates one. */
export interface ShareEvent {
  share_event_id: number;
  user_id: number;
  template: ShareTemplate;
  format: ShareFormat;
  outcome: ShareOutcome;
  created_at: string;
}

export interface CreateShareEventInput {
  user_id: number;
  template: ShareTemplate;
  format: ShareFormat;
  outcome: ShareOutcome;
}

/**
 * The counter behind the share feature.
 *
 * Cards are drawn in the browser and handed straight to the OS, so this server
 * sees nothing of it. Without these rows there is no way to answer the only
 * question the feature was built to answer — which of the three templates, and
 * which of the two formats, anyone actually uses.
 *
 * Deliberately thin: one insert. There is no read endpoint because nobody in
 * the app needs to see this; it is answered with SQL when the question comes up.
 */
export const shareEventRepository = {
  async create(input: CreateShareEventInput): Promise<ShareEvent> {
    const { rows } = await query<ShareEvent>(
      `INSERT INTO share_events (user_id, template, format, outcome)
       VALUES ($1, $2, $3, $4)
       RETURNING share_event_id, user_id, template, format, outcome, created_at`,
      [input.user_id, input.template, input.format, input.outcome],
    );
    return rows[0]!;
  },
};
