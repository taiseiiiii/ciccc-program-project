import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Card from "../components/Card";

// Mock data for Recharts
// AreaCharts
const monthlySessionFrequencyData = [
  { date: "Aug 1", sessions: 1, cumulativeSessions: 1 },
  { date: "Aug 2", sessions: 0, cumulativeSessions: 1 },
  { date: "Aug 3", sessions: 1, cumulativeSessions: 2 },
  { date: "Aug 4", sessions: 0, cumulativeSessions: 2 },
  { date: "Aug 5", sessions: 1, cumulativeSessions: 3 },
  { date: "Aug 6", sessions: 0, cumulativeSessions: 3 },
  { date: "Aug 7", sessions: 0, cumulativeSessions: 3 },
  { date: "Aug 8", sessions: 1, cumulativeSessions: 4 },
  { date: "Aug 9", sessions: 0, cumulativeSessions: 4 },
  { date: "Aug 10", sessions: 1, cumulativeSessions: 5 },
  { date: "Aug 11", sessions: 0, cumulativeSessions: 5 },
  { date: "Aug 12", sessions: 1, cumulativeSessions: 6 },
  { date: "Aug 13", sessions: 0, cumulativeSessions: 6 },
  { date: "Aug 14", sessions: 0, cumulativeSessions: 6 },
  { date: "Aug 15", sessions: 1, cumulativeSessions: 7 },
  { date: "Aug 16", sessions: 0, cumulativeSessions: 7 },
  { date: "Aug 17", sessions: 1, cumulativeSessions: 8 },
  { date: "Aug 18", sessions: 0, cumulativeSessions: 8 },
  { date: "Aug 19", sessions: 1, cumulativeSessions: 9 },
  { date: "Aug 20", sessions: 0, cumulativeSessions: 9 },
  { date: "Aug 21", sessions: 0, cumulativeSessions: 9 },
  { date: "Aug 22", sessions: 1, cumulativeSessions: 10 },
  { date: "Aug 23", sessions: 0, cumulativeSessions: 10 },
  { date: "Aug 24", sessions: 1, cumulativeSessions: 11 },
  { date: "Aug 25", sessions: 0, cumulativeSessions: 11 },
  { date: "Aug 26", sessions: 1, cumulativeSessions: 12 },
  { date: "Aug 27", sessions: 0, cumulativeSessions: 12 },
  { date: "Aug 28", sessions: 0, cumulativeSessions: 12 },
  { date: "Aug 29", sessions: 1, cumulativeSessions: 13 },
  { date: "Aug 30", sessions: 0, cumulativeSessions: 13 },
  { date: "Aug 31", sessions: 1, cumulativeSessions: 14 },
];

// Horizontal BarChart
const gradeSuccessRateData = [
  { grade: "V0", successRate: 100, sends: 12, fails: 0 },
  { grade: "V1", successRate: 95, sends: 18, fails: 1 },
  { grade: "V2", successRate: 88, sends: 22, fails: 3 },
  { grade: "V3", successRate: 75, sends: 15, fails: 5 },
  { grade: "V4", successRate: 50, sends: 10, fails: 10 },
  { grade: "V5", successRate: 25, sends: 4, fails: 12 },
  { grade: "V6", successRate: 10, sends: 1, fails: 9 },
];

// Heatmap
const sessionHeatmapData = [
  { day: "Mon", timeSlot: "Morning", value: 0 },
  { day: "Mon", timeSlot: "Afternoon", value: 1 },
  { day: "Mon", timeSlot: "Evening", value: 4 },

  { day: "Tue", timeSlot: "Morning", value: 1 },
  { day: "Tue", timeSlot: "Afternoon", value: 0 },
  { day: "Tue", timeSlot: "Evening", value: 2 },

  { day: "Wed", timeSlot: "Morning", value: 0 },
  { day: "Wed", timeSlot: "Afternoon", value: 2 },
  { day: "Wed", timeSlot: "Evening", value: 5 },

  { day: "Thu", timeSlot: "Morning", value: 0 },
  { day: "Thu", timeSlot: "Afternoon", value: 1 },
  { day: "Thu", timeSlot: "Evening", value: 1 },

  { day: "Fri", timeSlot: "Morning", value: 2 },
  { day: "Fri", timeSlot: "Afternoon", value: 3 },
  { day: "Fri", timeSlot: "Evening", value: 6 },

  { day: "Sat", timeSlot: "Morning", value: 5 },
  { day: "Sat", timeSlot: "Afternoon", value: 7 },
  { day: "Sat", timeSlot: "Evening", value: 2 },

  { day: "Sun", timeSlot: "Morning", value: 4 },
  { day: "Sun", timeSlot: "Afternoon", value: 5 },
  { day: "Sun", timeSlot: "Evening", value: 1 },
];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const timeSlots = ["Morning", "Afternoon", "Evening"];

const getBgColor = (val: number) => {
  if (val === 0) return "bg-surface-container-high opacity-30";
  if (val < 3) return "bg-primary-container/40 text-on-surface";
  if (val < 5) return "bg-primary-container text-on-primary-container";
  return "bg-primary text-on-primary font-bold";
};

const gradeAttemptsData = [
  { grade: "V0", totalAttempts: 12, sends: 12, fails: 0 },
  { grade: "V1", totalAttempts: 19, sends: 18, fails: 1 },
  { grade: "V2", totalAttempts: 25, sends: 22, fails: 3 },
  { grade: "V3", totalAttempts: 20, sends: 15, fails: 5 },
  { grade: "V4", totalAttempts: 20, sends: 10, fails: 10 },
  { grade: "V5", totalAttempts: 16, sends: 4, fails: 12 },
  { grade: "V6", totalAttempts: 10, sends: 1, fails: 9 },
  { grade: "V7", totalAttempts: 4, sends: 0, fails: 4 },
];

const Progress = () => {
  return (
    <div>
      <h1 className="text-primary text-headline-md font-bold tracking-tight">
        Performance Analytics
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 mb-4">
        <Card className="p-4 bg-card flex flex-col justify-center">
          <h3 className="text-sm font-medium text-muted-foreground">
            TOTAL SENDS / MONTH
          </h3>
          <div className="flex flex-col gap-3 justify-baseline">
            <p className="text-4xl font-bold mt-2 text-primary">60</p>
            <p className="text-primary">+ 10 from last month</p>
          </div>
        </Card>

        <Card className="p-4 bg-card flex flex-col justify-center">
          <h3 className="text-sm font-medium text-muted-foreground">
            HIGHEST GRADE
          </h3>
          <div className="flex flex-col gap-3 justify-baseline">
            <p className="text-4xl font-bold mt-2 text-error">V4</p>
            <p>Projecting V5</p>
          </div>
        </Card>

        <Card className="p-4 bg-card flex flex-col justify-center">
          <h3 className="text-sm font-medium text-muted-foreground">
            CLIMBING HOURS / MONTH
          </h3>
          <div className="flex flex-col gap-3 justify-baseline">
            <p className="text-4xl font-bold mt-2 text-secondary">15h</p>
            <p>Arg 3h / session</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 mb-4">
        <Card className="p-4 bg-card flex flex-col justify-center">
          <h3 className="text-sm font-medium text-muted-foreground">
            Monthly Session Frequency
          </h3>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlySessionFrequencyData}>
                <defs>
                  <linearGradient
                    id="colorSessions"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-primary)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-primary)"
                      stopOpacity={0.0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  stroke="var(--color-outline)"
                  fontSize={11}
                  interval={4}
                />
                <YAxis stroke="var(--color-outline)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-surface-container-highest)",
                    borderColor: "var(--color-outline-variant)",
                    borderRadius: "8px",
                    color: "var(--color-on-surface)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeSessions"
                  stroke="var(--color-primary)"
                  fillOpacity={1}
                  fill="url(#colorSessions)"
                  name="Total Visits"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 bg-card flex flex-col justify-center">
          <h3 className="text-sm font-medium text-muted-foreground">
            Success Rate by Grade (%)
          </h3>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gradeSuccessRateData} layout="vertical">
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  stroke="var(--color-outline)"
                  fontSize={11}
                  unit="%"
                />
                <YAxis
                  dataKey="grade"
                  type="category"
                  stroke="var(--color-outline)"
                  fontSize={12}
                />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, "Success Rate"]}
                  contentStyle={{
                    backgroundColor: "var(--color-surface-container-highest)",
                    borderColor: "var(--color-outline-variant)",
                    borderRadius: "8px",
                    color: "var(--color-on-surface)",
                  }}
                />
                <Bar
                  dataKey="successRate"
                  fill="var(--color-primary-container)"
                  radius={[0, 4, 4, 0]}
                  name="Success Rate"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 bg-card flex flex-col justify-center">
          <h3 className="text-sm font-medium text-muted-foreground">
            Session Activity Heatmap
          </h3>
          <div className="space-y-2">
            {/* Header (by the time) */}
            <div className="grid grid-cols-4 gap-1.5 text-center text-label-sm text-on-surface-variant font-medium">
              <div></div>
              <div>Morning</div>
              <div>Afternoon</div>
              <div>Evening</div>
            </div>

            {/*  Date of a week */}
            {days.map((day) => (
              <div key={day} className="grid grid-cols-4 gap-1.5 items-center">
                <div className="text-label-sm font-semibold text-on-surface-variant text-center">
                  {day}
                </div>
                {timeSlots.map((slot) => {
                  const item = sessionHeatmapData.find(
                    (d) => d.day === day && d.timeSlot === slot,
                  );
                  const val = item ? item.value : 0;
                  return (
                    <div
                      key={slot}
                      className={`h-8 rounded-md flex items-center justify-center text-xs transition-colors ${getBgColor(
                        val,
                      )}`}
                      title={`${day} ${slot}: ${val} sessions`}
                    >
                      {val > 0 ? val : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 bg-card flex flex-col justify-center">
          <h3 className="text-sm font-medium text-muted-foreground">
            Attempts Breakdown by Grade
          </h3>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gradeAttemptsData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--color-outline-variant)"
                />
                <XAxis
                  dataKey="grade"
                  stroke="var(--color-outline)"
                  fontSize={12}
                />
                <YAxis stroke="var(--color-outline)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-surface-container-highest)",
                    borderColor: "var(--color-outline-variant)",
                    borderRadius: "8px",
                    color: "var(--color-on-surface)",
                  }}
                />
                {/* Stacked Bar Chart: stackId="a" */}
                <Bar
                  dataKey="sends"
                  stackId="a"
                  fill="var(--color-primary)"
                  name="Sends (Success)"
                />
                <Bar
                  dataKey="fails"
                  stackId="a"
                  fill="var(--color-secondary-container)"
                  radius={[4, 4, 0, 0]}
                  name="Fails"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Progress;
