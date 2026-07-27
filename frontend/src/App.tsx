import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import AppRoutes from "./routes/AppRoutes";
import { Toaster } from "react-hot-toast";

const App = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className={`min-h-screen bg-background text-on-background`}>
          <BrowserRouter>
            <Toaster />
            <AppRoutes />
          </BrowserRouter>
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
