import { supabase } from "../lib/supabase";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1";

export const api = async <T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = errorData.error?.message || "An API error occurred";
    throw new Error(message);
  }
  if (res.status === 204) {
    return null as T;
  }
  return res.json();
};
