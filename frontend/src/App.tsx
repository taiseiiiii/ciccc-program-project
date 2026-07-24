import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import AppRoutes from "./routes/AppRoutes";
import { Toaster } from "react-hot-toast";

const App = () => {
  return (
    <ThemeProvider>
      <div className={`min-h-screen bg-background text-on-background`}>
        <BrowserRouter>
          <Toaster />
          <AppRoutes />
        </BrowserRouter>
      </div>
    </ThemeProvider>
  );
};

export default App;
