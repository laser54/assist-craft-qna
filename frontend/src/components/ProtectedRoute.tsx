import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";

export const ProtectedRoute = () => {
  const { isAuthenticated, isLoading, error } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isAuthError = error instanceof ApiError && error.status === 401;

  if (!isAuthenticated && (error == null || isAuthError)) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4 text-center p-6">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="text-muted-foreground max-w-md">
          {error?.message ?? "Please refresh in a moment or sign back in."}
        </p>
        <button
          type="button"
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          Refresh page
        </button>
      </div>
    );
  }

  return <Outlet />;
};

export default ProtectedRoute;


