/**
 * The app-side profile row returned by GET /users/me. Mirrors the server's
 * `users` table — authentication itself lives in Supabase Auth, keyed here by
 * auth_user_id (the JWT `sub` claim).
 */
export default interface User {
  user_id: number;
  auth_user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: "active" | "withdrawn" | "suspended";
  created_at: string;
  updated_at: string;
}
