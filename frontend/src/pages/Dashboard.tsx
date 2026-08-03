import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const Dashboard = () => {
  // The server answers 503 when its database is down, so an error here means
  // "unreachable or unhealthy" — not only "not found".
  const { isPending, isError } = useQuery({
    queryKey: ["health"],
    queryFn: () => api<{ status: string; db: "up" | "down" }>("/health"),
    // A liveness indicator should react quickly and keep itself current:
    // one retry instead of the default three, and a periodic refetch.
    retry: 1,
    refetchInterval: 30 * 1000,
  });
  return (
    <div>
      <h1>Dashboard Page</h1>
      <div className="font-bold">Server Connection</div>
      <div
        className={
          isPending
            ? "text-amber-200"
            : isError
              ? "text-amber-700"
              : "text-blue-600"
        }
      >
        {isPending
          ? "connecting..."
          : isError
            ? "Server connection failed"
            : "It's connected!"}
      </div>
    </div>
  );
};

export default Dashboard;
