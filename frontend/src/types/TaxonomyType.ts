/**
 * A term from one of the three master vocabularies the forms render as
 * buttons: wall angles (`/wall-types`), hold types (`/hold-types`) and body
 * parts (`/body-parts`).
 *
 * All three have the same shape, so one type covers them. They only change
 * when a migration changes them, which is why every query for them is set to
 * `staleTime: Infinity`.
 */
export default interface TaxonomyTerm {
  id: number;
  code: string;
  label: string;
  sort_order: number;
}
