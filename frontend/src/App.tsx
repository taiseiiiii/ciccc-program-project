import { useState } from "react";
import Button from "./components/Button";
import Input from "./components/Input";
import Card from "./components/Card";

const App = () => {
  const [isDark, setIsDark] = useState(false);

  return (
    <div
      className={`p-8 min-h-screen bg-background text-on-background ${isDark ? "dark" : ""}`}
    >
      <h1 className="text-body-lg">Testing page!</h1>
      <Button variant="secondary" onClick={() => setIsDark(!isDark)}>
        {isDark ? "Light" : "Dark"}
      </Button>
      <Card>
        <Input
          type="email"
          label="Email"
          placeholder="Type your email address"
        />
        <Button variant="primary">View</Button>
      </Card>
    </div>
  );
};

export default App;
