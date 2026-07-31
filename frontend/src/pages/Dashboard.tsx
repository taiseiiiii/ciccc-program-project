import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const Dashboard = () => {
  const { data, isPending, isError } = useQuery({
    queryKey: ["health"],
    queryFn: () => api("/health"),
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
            ? "Server is not found"
            : "It's connected!"}
      </div>
    </div>
  );
};

export default Dashboard;
