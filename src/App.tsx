import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Auth from "./pages/Auth";
import OrgSetup from "./pages/OrgSetup";
import Dashboard from "./pages/Dashboard";
import Stack from "./pages/Stack";
import StackMap from "./pages/StackMap";
import Research from "./pages/Research";
import Settings from "./pages/Settings";
import Integrations from "./pages/Integrations";
import Budget from "./pages/Budget";
import Admin from "./pages/Admin";
import AppLayout from "./components/AppLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, orgId } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!orgId) return <Navigate to="/setup" replace />;
  return <AppLayout>{children}</AppLayout>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<Auth />} />
    <Route path="/setup" element={<OrgSetup />} />
    <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
    <Route path="/stack" element={<ProtectedRoute><Stack /></ProtectedRoute>} />
    <Route path="/map" element={<ProtectedRoute><StackMap /></ProtectedRoute>} />
    <Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
    <Route path="/budget" element={<ProtectedRoute><Budget /></ProtectedRoute>} />
    <Route path="/team" element={<Navigate to="/settings" replace />} />
    <Route path="/research" element={<ProtectedRoute><Research /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
    <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
