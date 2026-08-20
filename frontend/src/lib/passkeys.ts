import { supabase } from "./supabase";
import type { PasskeyListItem } from "@supabase/supabase-js";

/**
 * Face ID, Touch ID, Windows Hello, or a hardware key, instead of a password.
 *
 * A passkey is a key pair the device holds and the browser will only release
 * after a biometric or PIN check. Supabase stores the public half and runs the
 * WebAuthn ceremony; nothing secret ever reaches this app, and there is no
 * password to phish or reuse.
 *
 * Everything here is wrapped for two reasons:
 *
 *   * The SDK marks these methods experimental and they throw outright unless
 *     `auth.experimental.passkey` is set. A shape change upstream should turn
 *     the feature off, not break signing in.
 *
 *   * WebAuthn is unavailable on older browsers and in some in-app webviews,
 *     and a climber who cancels the system prompt is not an error worth
 *     shouting about. Both read as "passkeys are not for this device" here.
 *
 * The password flow stays primary throughout. This is an addition to it.
 */

export type Passkey = PasskeyListItem;

/**
 * Whether this browser can do the WebAuthn ceremony at all.
 *
 * Checked before offering anything: an "Add Face ID" button that fails on tap
 * is worse than no button. Note it says nothing about whether the *account* has
 * a passkey — that is what `listPasskeys` answers.
 */
export function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    // Secure context is a hard WebAuthn requirement; localhost counts as one.
    window.isSecureContext
  );
}

/** True when the climber dismissed the system prompt rather than failing it. */
export function isUserCancellation(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === "NotAllowedError" || name === "AbortError";
}

/** Register a passkey for the signed-in climber. */
export async function registerPasskey(): Promise<void> {
  const { error } = await supabase.auth.registerPasskey();
  if (error) throw error;
}

/**
 * Sign in with a passkey.
 *
 * The browser decides which credential to offer — the climber picks their
 * account from the system prompt, so no email is typed first.
 */
export async function signInWithPasskey(): Promise<void> {
  const { error } = await supabase.auth.signInWithPasskey();
  if (error) throw error;
}

/** The passkeys on this account, across every device. */
export async function listPasskeys(): Promise<Passkey[]> {
  const { data, error } = await supabase.auth.passkey.list();
  if (error) throw error;
  return data ?? [];
}

/** Remove one. The credential stays on the device but no longer signs in. */
export async function deletePasskey(passkeyId: string): Promise<void> {
  const { error } = await supabase.auth.passkey.delete({ passkeyId });
  if (error) throw error;
}
