import { useEffect } from "react";
import toast from "react-hot-toast";
// Read from the instance rather than the hook: these render inside a toast
// callback, outside this component's own render.
import i18n from "../i18n";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Registers the service worker and surfaces its two states.
 *
 * The worker is registered with `registerType: "prompt"`, so a newly deployed
 * build waits in the background instead of taking over — this is what offers
 * it to the user. Without the offer an open tab would keep serving the old
 * bundle indefinitely.
 *
 * Renders nothing; it drives the existing <Toaster />.
 */
export default function PWAUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!offlineReady) return;
    toast.success(i18n.t("pwa.offlineReady"));
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady]);

  useEffect(() => {
    if (!needRefresh) return;

    const id = toast(
      (t) => (
        <div className="flex items-center gap-3">
          <span className="text-body-md">{i18n.t("pwa.updateAvailable")}</span>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              // Activates the waiting worker, then reloads the page for us.
              updateServiceWorker(true);
            }}
            className="px-3 py-1 rounded-lg bg-primary text-on-primary text-label-md cursor-pointer"
          >
            {i18n.t("errorBoundary.reload")}
          </button>
        </div>
      ),
      // Sticky: dismissing on a timer would drop the only path to the update.
      { duration: Infinity },
    );

    return () => {
      toast.dismiss(id);
      setNeedRefresh(false);
    };
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}
