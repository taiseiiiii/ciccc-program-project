import { useTheme } from "../context/ThemeContext";
import Button from "../components/Button";

const Dashboard = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <h1>Dashboard Page</h1>
      <Button variant="secondary" onClick={toggleTheme}>
        {theme === "dark" ? "Light" : "Dark"}
      </Button>
    </div>
  );
};

export default Dashboard;
