import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Card from "../components/Card";
import PasskeyCard from "../components/PasskeyCard";
import LanguageCard from "../components/LanguageCard";
import Button from "../components/Button";
import Input from "../components/Input";
import SignoutButton from "../components/SignoutButton";
import ConfirmDialog from "../components/ConfirmDialog";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDate, formatMinutes } from "../lib/date";
import type User from "../types/UserType";
import type { MediaUsage } from "../types/MediaType";
import type Stats from "../types/StatsType";
import { currentMonthKey, todayString } from "../lib/date";

/** Bytes as something a person reads. */
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const Profile = () => {
  const { t } = useTranslation("profile");
  const { profile, profileError, signOut } = useAuth();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [isClosingAccount, setIsClosingAccount] = useState(false);

  /** How much of the storage allowance the climber's photos and videos use. */
  const { data: usageData } = useQuery({
    queryKey: ["media-usage"],
    queryFn: () => api<{ data: MediaUsage }>("/media/usage"),
  });

  const { data: statsData } = useQuery({
    queryKey: ["stats", currentMonthKey()],
    queryFn: () =>
      api<{ data: Stats }>(
        `/stats?month=${currentMonthKey()}&today=${todayString()}`,
      ),
  });

  const { mutate: saveProfile, isPending: isSaving } = useMutation({
    mutationFn: (patch: { first_name: string | null; last_name: string | null }) =>
      api<{ data: User }>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      // The profile lives in AuthContext, which loads it once per session, so
      // a full reload is the honest way to show the new name everywhere.
      queryClient.invalidateQueries();
      setIsEditing(false);
      toast.success(t("profile.toastUpdated"));
      window.location.reload();
    },
    onError: (err) => toast.error(err.message),
  });

  const { mutate: closeAccount, isPending: isClosing } = useMutation({
    mutationFn: () => api("/users/me", { method: "DELETE" }),
    onSuccess: async () => {
      toast.success(t("profile.toastClosed"));
      await signOut();
    },
    onError: (err) => toast.error(err.message),
  });

  const usage = usageData?.data;
  const lifetime = statsData?.data?.lifetime;
  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-stack-md max-w-2xl">
      <h1 className="text-headline-md font-bold text-on-surface tracking-tight">
        {t("profile.title")}
      </h1>

      {profileError && (
        <Card className="bg-error-container text-on-error-container">
          {t("profile.loadError", { error: profileError })}
        </Card>
      )}

      {!profile && !profileError && <Card>{t("common:state.loading")}</Card>}

      {profile && (
        <>
          <Card>
            {isEditing ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col md:flex-row gap-3">
                  <Input
                    label={t("profile.firstName")}
                    value={firstName}
                    autoComplete="given-name"
                    maxLength={100}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                  <Input
                    label={t("profile.lastName")}
                    value={lastName}
                    autoComplete="family-name"
                    maxLength={100}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setFirstName(profile.first_name ?? "");
                      setLastName(profile.last_name ?? "");
                      setIsEditing(false);
                    }}
                  >
                    {t("common:action.cancel")}
                  </Button>
                  <Button
                    disabled={isSaving}
                    onClick={() =>
                      saveProfile({
                        first_name: firstName.trim() || null,
                        last_name: lastName.trim() || null,
                      })
                    }
                  >
                    {isSaving
                      ? t("common:action.saving")
                      : t("common:action.save")}
                  </Button>
                </div>
              </div>
            ) : (
              <dl className="flex flex-col gap-stack-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <dt className="text-on-surface-variant text-body-sm">
                      {t("profile.name")}
                    </dt>
                    <dd>{fullName || "—"}</dd>
                  </div>
                  <Button variant="secondary" onClick={() => setIsEditing(true)}>
                    {t("common:action.edit")}
                  </Button>
                </div>
                <div>
                  <dt className="text-on-surface-variant text-body-sm">
                    {t("profile.email")}
                  </dt>
                  <dd>{profile.email}</dd>
                </div>
                <div>
                  <dt className="text-on-surface-variant text-body-sm">
                    {t("profile.memberSince")}
                  </dt>
                  <dd>{formatDate(profile.created_at.slice(0, 10))}</dd>
                </div>
              </dl>
            )}
          </Card>

          {lifetime && (
            <Card>
              <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-3">
                {t("profile.allTime")}
              </h2>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <dt className="text-on-surface-variant text-body-sm">
                    {t("profile.sessions")}
                  </dt>
                  <dd className="text-headline-sm font-bold tabular-nums">
                    {lifetime.sessions}
                  </dd>
                </div>
                <div>
                  <dt className="text-on-surface-variant text-body-sm">
                    {t("profile.routes")}
                  </dt>
                  <dd className="text-headline-sm font-bold tabular-nums">
                    {lifetime.routes}
                  </dd>
                </div>
                <div>
                  <dt className="text-on-surface-variant text-body-sm">
                    {t("profile.sends")}
                  </dt>
                  <dd className="text-headline-sm font-bold tabular-nums">
                    {lifetime.sends}
                  </dd>
                </div>
                <div>
                  <dt className="text-on-surface-variant text-body-sm">
                    {t("profile.onTheWall")}
                  </dt>
                  <dd className="text-headline-sm font-bold tabular-nums">
                    {formatMinutes(lifetime.minutes)}
                  </dd>
                </div>
              </dl>
            </Card>
          )}

          {usage && (
            <Card>
              <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
                {t("profile.storageTitle")}
              </h2>
              <div
                className="h-2 w-full rounded-full bg-surface-container-high overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(
                  (usage.used_bytes / usage.limit_bytes) * 100,
                )}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t("profile.storageUsedAria")}
              >
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, (usage.used_bytes / usage.limit_bytes) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-on-surface-variant text-body-sm mt-2">
                {t("profile.storageUsage", {
                  used: formatBytes(usage.used_bytes),
                  limit: formatBytes(usage.limit_bytes),
                })}
              </p>
            </Card>
          )}

          <LanguageCard />

          <Card>
            <h2 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wide mb-2">
              {t("profile.importTitle")}
            </h2>
            <p className="text-on-surface-variant text-body-sm">
              {t("profile.importBody")}
            </p>
            <div className="mt-4">
              <Link
                to="/import"
                className="inline-block px-4 py-2 rounded-lg font-sans text-label-md bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-all"
              >
                {t("profile.importCta")}
              </Link>
            </div>
          </Card>

          <PasskeyCard />

          <Card className="border-error/40">
            <h2 className="text-label-md font-bold text-error uppercase tracking-wide mb-2">
              {t("profile.accountTitle")}
            </h2>
            <p className="text-on-surface-variant text-body-sm">
              {t("profile.accountBody")}
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <SignoutButton variant="secondary">
                {t("common:action.signOut")}
              </SignoutButton>
              <Button variant="error" onClick={() => setIsClosingAccount(true)}>
                {t("profile.closeAccount")}
              </Button>
            </div>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={isClosingAccount}
        onCancel={() => setIsClosingAccount(false)}
        onConfirm={() => closeAccount()}
        title={t("profile.closeTitle")}
        message={
          lifetime
            ? t("profile.closeMessage", { count: lifetime.sessions })
            : t("profile.closeMessagePlain")
        }
        confirmLabel={t("profile.closeAccount")}
        isPending={isClosing}
      />
    </div>
  );
};

export default Profile;
