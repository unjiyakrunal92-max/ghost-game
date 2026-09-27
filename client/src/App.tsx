import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";

import { useAuth } from "./_core/hooks/useAuth";

function ProtectedGame() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090914] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="text-6xl animate-pulse">👻</div>
          <p className="text-purple-300 font-medium tracking-wide">Entering Mourningwood Estate...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    window.location.replace("/login");
    return null;
  }

  return <Home />;
}

function PublicAuthRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return null;
  }

  if (isAuthenticated && user) {
    window.location.replace("/");
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={ProtectedGame} />
      <Route path={"/login"}>{() => <PublicAuthRoute component={Login} />}</Route>
      <Route path={"/register"}>{() => <PublicAuthRoute component={Register} />}</Route>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
