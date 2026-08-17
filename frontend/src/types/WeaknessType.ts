/**
 * A self-reported weakness — why a climb went the way it did, in the climber's
 * own words.
 *
 * `user_id` is null for the shared presets and set for labels this climber
 * typed in themselves. The form treats both the same; only the climber's own
 * can be deleted.
 *
 * Note this is a different thing from `analysis_data.weaknesses`, which is the
 * AI's read. Keeping them apart is what lets the coach compare the two.
 */
export default interface WeaknessType {
  weakness_type_id: number;
  user_id: number | null;
  label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
