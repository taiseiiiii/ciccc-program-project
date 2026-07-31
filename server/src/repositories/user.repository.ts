import { query } from '../db/pool';

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
  created_at: string;
  updated_at: string;
}

export interface ProvisionUserInput {
  auth_user_id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
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
      `INSERT INTO users (auth_user_id, email, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email
       RETURNING *`,
      [input.auth_user_id, input.email, input.first_name ?? null, input.last_name ?? null],
    );
    return rows[0]!;
  },
};
