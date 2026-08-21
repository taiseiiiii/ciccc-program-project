import { DEFAULT_LOCALE, type Locale } from '../config/locales';
import { query } from '../db/pool';
import { buildUpdate } from '../utils/buildUpdate';

/**
 * Shape of a row in the `users` table. Authentication lives in Supabase Auth;
 * this row is the app-side profile, keyed to Supabase by auth_user_id (the
 * JWT `sub` claim).
 */
export interface User {
  user_id: number;
  auth_user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: 'active' | 'withdrawn' | 'suspended';
  /** Language for the interface and for AI-generated reports. */
  locale: Locale;
  created_at: string;
  updated_at: string;
}

export interface ProvisionUserInput {
  auth_user_id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  /** The language the climber signed up in. Omitted for accounts created
   *  before the frontend started sending it; those fall back to the default. */
  locale?: Locale;
}

/**
 * What a climber may change about their own profile.
 *
 * Not `email`: that is Supabase Auth's, and changing it here would leave the
 * two disagreeing about who this account is. Not `status` in general either —
 * only the one transition below, which is a climber closing their own account.
 */
export interface UpdateUserInput {
  first_name?: string | null;
  last_name?: string | null;
  locale?: Locale;
}

/**
 * Data-access layer for users. Every SQL statement here is parameterized
 * ($1, $2, ...) so values are never concatenated into the query string.
 */
export const userRepository = {
  async findByAuthId(authUserId: string): Promise<User | null> {
    const { rows } = await query<User>(
      `SELECT * FROM users WHERE auth_user_id = $1`,
      [authUserId],
    );
    return rows[0] ?? null;
  },

  /**
   * Just-in-time provisioning: create the profile row for a verified Supabase
   * user. ON CONFLICT makes concurrent first requests safe — whichever INSERT
   * loses the race falls through to a no-op update and still returns the row.
   */
  async provision(input: ProvisionUserInput): Promise<User> {
    const { rows } = await query<User>(
      `INSERT INTO users (auth_user_id, email, first_name, last_name, locale)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email
       RETURNING *`,
      [
        input.auth_user_id,
        input.email,
        input.first_name ?? null,
        input.last_name ?? null,
        input.locale ?? DEFAULT_LOCALE,
      ],
    );
    return rows[0]!;
  },

  /** Update the caller's own display name. */
  async update(userId: number, input: UpdateUserInput): Promise<User | null> {
    const statement = buildUpdate(
      'users',
      {
        first_name: input.first_name,
        last_name: input.last_name,
        locale: input.locale,
      },
      { user_id: userId },
      { returning: '*' },
    );
    if (!statement) {
      const { rows } = await query<User>(
        `SELECT * FROM users WHERE user_id = $1`,
        [userId],
      );
      return rows[0] ?? null;
    }

    const { rows } = await query<User>(statement.text, statement.values);
    return rows[0] ?? null;
  },

  /**
   * Close an account.
   *
   * Flips `status` to 'withdrawn', which `requireAuth` already refuses to let
   * through — so the next request with a still-valid token gets a 403 rather
   * than silently working. The rows are kept: `ON DELETE CASCADE` from `users`
   * would take every session, climb, report and injury with them, and a climber
   * tapping "close my account" at 11pm should not lose two years of logs to a
   * mis-tap. Deleting the Supabase Auth user is the separate, deliberate step.
   */
  async withdraw(userId: number): Promise<User | null> {
    const { rows } = await query<User>(
      `UPDATE users SET status = 'withdrawn'
        WHERE user_id = $1
        RETURNING *`,
      [userId],
    );
    return rows[0] ?? null;
  },
};
