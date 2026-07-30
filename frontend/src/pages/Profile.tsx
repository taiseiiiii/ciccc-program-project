import Card from "../components/Card";
import SignoutButton from "../components/SignoutButton";
import { useAuth } from "../context/AuthContext";

const Profile = () => {
  const { profile, profileError } = useAuth();

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-stack-md">
      <h1 className="text-2xl font-semibold">Profile</h1>

      {profileError && (
        <Card className="text-error">
          Could not load your profile: {profileError}
        </Card>
      )}

      {!profile && !profileError && <Card>Loading…</Card>}

      {profile && (
        <Card>
          <dl className="flex flex-col gap-stack-sm">
            <div>
              <dt className="text-on-surface-variant text-sm">Name</dt>
              <dd>{fullName || "—"}</dd>
            </div>
            <div>
              <dt className="text-on-surface-variant text-sm">Email</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt className="text-on-surface-variant text-sm">Member since</dt>
              <dd>{new Date(profile.created_at).toLocaleDateString()}</dd>
            </div>
          </dl>
        </Card>
      )}

      <div>
        <SignoutButton variant="error">Sign out</SignoutButton>
      </div>
    </div>
  );
};

export default Profile;
