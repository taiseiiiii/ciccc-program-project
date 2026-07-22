import { useState } from "react";
import Card from "../components/Card";
import Input from "../components/Input";
import Button from "../components/Button";

const LogSession = () => {
  const today = new Date().toISOString().split("T")[0];
  const [visitDate, setVisitDate] = useState(today);
  const [gymName, setGymName] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("V3");
  const GRADES = [
    "V0",
    "V1",
    "V2",
    "V3",
    "V4",
    "V5",
    "V6",
    "V7",
    "V8",
    "V9",
    "V10",
    "V11",
    "V12",
    "V13",
    "V14",
    "V15",
    "V16",
    "V17",
  ];

  return (
    <div>
      <h1 className="text-on-surface text-headline-md font-bold tracking-tight">
        New Performance Entry
      </h1>
      <p>
        Log your latest sends and track your progress through technical
        analytics.
      </p>
      <Card>
        <Input
          type="text"
          label="Location"
          placeholder="The hive"
          value={gymName}
          autoCapitalize="words"
          className="capitalize"
          onChange={(e) => setGymName(e.target.value)}
        />
        <Input
          type="date"
          label="Session Date"
          value={visitDate}
          onChange={(e) => setVisitDate(e.target.value)}
        />
      </Card>
      <Card>
        <div>
          <p className="text-label-md text-on-surface-variant mb-2">
            Grades (v-Score)
          </p>
          <div className="flex flex-row gap-2 overflow-x-auto py-2">
            {GRADES.map((grade) => (
              <Button
                key={grade}
                onClick={() => setSelectedGrade(grade)}
                className={
                  selectedGrade === grade
                    ? ""
                    : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                }
              >
                {grade}
              </Button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default LogSession;
