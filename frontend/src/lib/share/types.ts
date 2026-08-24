/**
 * What a share card is allowed to contain.
 *
 * These types are the privacy line, expressed as code. A card is drawn only
 * from a `ShareSubject`, and a `ShareSubject` is built by hand in
 * `buildSubject.ts` — never by spreading an API response — so a field added to
 * `attempts` or `sessions` later cannot arrive on a published image by
 * accident. Adding something here is a deliberate act with a diff.
 *
 * Deliberately absent, and to stay absent:
 *
 *   - `attempts.note` — free text written for nobody but the climber
 *   - weakness tags — "Fear of falling", "Finger strength". Self-assessment,
 *     closer in kind to the injury records than to a grade
 *   - injuries and pain check-ins, in any form
 *   - AI performance/training report text
 *   - the climber's name, email, or any identifier
 *
 * What is here is the fact that a climb happened: the grade, how many tries it
 * took, where, and when. That is the caption a climber would write themselves.
 */

/** Which card. The three differ by subject, not by styling. */
export type ShareTemplate = "climb" | "session" | "month";

/**
 * What leaves the app.
 *
 * `image` is the card this app draws from nothing but the log. The other two
 * put the same overlay on something the climber supplied — which is the whole
 * difference, and why they are counted separately: a card is the app's picture
 * of a climb, a photo or video is theirs.
 */
export type ShareFormat = "image" | "photo" | "video";

/** Handed to the OS share sheet, or written to the device. */
export type ShareOutcome = "shared" | "saved";

/** A grade with how it went, for the small breakdown strips. */
export interface GradeTally {
  grade: string;
  attempts: number;
  sends: number;
}

/** One route, as logged on one visit. */
export interface ClimbSubject {
  template: "climb";
  grade: string;
  routeName: string | null;
  attemptCount: number;
  sendCount: number;
  wallLabels: string[];
  holdLabels: string[];
  gymName: string | null;
  /** `YYYY-MM-DD`. */
  date: string;
}

/** One gym visit. */
export interface SessionSubject {
  template: "session";
  /** `YYYY-MM-DD`. */
  date: string;
  gymName: string | null;
  climbCount: number;
  totalAttempts: number;
  totalSends: number;
  highestGrade: string | null;
  grades: GradeTally[];
  durationMinutes: number | null;
}

/** One calendar month. */
export interface MonthSubject {
  template: "month";
  /** `YYYY-MM`. */
  month: string;
  sessions: number;
  climbingDays: number;
  routes: number;
  attempts: number;
  sends: number;
  flashes: number;
  highestGrade: string | null;
  grades: GradeTally[];
}

export type ShareSubject = ClimbSubject | SessionSubject | MonthSubject;

/**
 * Text the card renders, resolved by the caller.
 *
 * The drawing code takes finished strings rather than calling i18next itself:
 * a canvas routine that reaches for a translation hook is a canvas routine that
 * cannot be unit-tested or reused from a worker. It also keeps every
 * user-visible string in the catalogues, where the Japanese and English
 * versions sit next to each other.
 */
export interface CardStrings {
  /** e.g. "Flash", "3便目で完登", "Sent 2 of 5", "5 tries". */
  result: string;
  /** Section labels on the session/month cards. */
  sent: string;
  tries: string;
  routes: string;
  days: string;
  flashes: string;
  best: string;
  /** Pre-formatted date or month, in the reader's locale. */
  when: string;
  /** Session duration, already formatted ("2h 15m"), or null. */
  duration: string | null;
}
