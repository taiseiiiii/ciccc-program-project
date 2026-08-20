import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  deletePasskey,
  isPasskeySupported,
  isUserCancellation,
  listPasskeys,
  registerPasskey,
} from "../lib/passkeys";
import { formatDate } from "../lib/date";
import Button from "./Button";
import Card from "./Card";

/**
 * Sign in with Face ID, Touch ID, Windows Hello, or a hardware key.
 *
 * Hidden entirely on a browser that cannot do WebAuthn, rather than shown
 * disabled: an "Add Face ID" button that fails on tap is worse than no button.
 *
 * If the API is unavailable — the feature is experimental in the SDK and has to
 * be switched on for the project — the query fails and the card explains that
 * instead of pretending nothing is there. The password sign-in it sits beside
 * keeps working either way.
 */
export default function PasskeyCard() {
  const queryClient = useQueryClient();
  const supported = isPasskeySupported();

  const { data: passkeys, isPending, isError } = useQuery({
    queryKey: ["passkeys"],
    queryFn: listPasskeys,
    enabled: supported,
    retry: false,
  });

  const { mutate: add, isPending: isAdding } = useMutation({
    mutationFn: registerPasskey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
      toast.success("Passkey added — you can sign in with it next time");
    },
    onError: (err) => {
      // Dismissing the system prompt is a decision, not a failure.
      if (isUserCancellation(err)) return;
      toast.error(err instanceof Error ? err.message : "Could not add a passkey");
    },
  });

  const { mutate: remove, isPending: isRemoving } = useMutation({
    mutationFn: deletePasskey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
      toast.success("Passkey removed");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not remove it"),
  });

  if (!supported) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide">
          Face ID &amp; passkeys
        </h2>
        <span className="text-tertiary bg-tertiary/10 px-2 py-0.5 rounded-full text-xs uppercase tracking-wide">
          Beta
        </span>
      </div>

      <p className="text-on-surface-variant text-body-sm">
        Sign in with your face, fingerprint, or device PIN instead of typing a
        password. Your device keeps the key and never shares it — add one per
        device you climb with.
      </p>

      {isError ? (
        <p className="text-on-surface-variant text-body-sm mt-3">
          Passkeys are not available on this account yet. Your password still
          works as usual.
        </p>
      ) : isPending ? (
        <p className="text-on-surface-variant text-body-sm mt-3 animate-pulse">
          Loading...
        </p>
      ) : (
        <>
          {passkeys.length > 0 && (
            <ul className="flex flex-col gap-2 mt-3 list-none p-0">
              {passkeys.map((passkey) => (
                <li
                  key={passkey.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-container-high/40 border border-outline-variant/30 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="font-medium truncate">
                      {passkey.friendly_name ?? "Passkey"}
                    </span>
                    <span className="block text-label-sm text-on-surface-variant">
                      Added {formatDate(passkey.created_at)}
                      {passkey.last_used_at &&
                        ` · last used ${formatDate(passkey.last_used_at)}`}
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    disabled={isRemoving}
                    onClick={() => remove(passkey.id)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <Button onClick={() => add()} disabled={isAdding}>
              {isAdding ? "Waiting for your device..." : "Add Face ID / passkey"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
