import { useQuery, useMutation, type MutationStatus } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/api";
import { useCallback } from "react";

const AUTH_KEY = ["auth", "session"] as const;

interface LoginResponse {
  ok: true;
  expiresAt: string;
}

interface MetricsResponse {
  ok: boolean;
  totalQa?: number;
  pineconeVectors?: number;
  rerankUsage?: {
    date: string;
    unitsUsed: number;
    limit: number | null;
    remaining: number | null;
  };
}

interface UseAuthResult {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (input: { password: string }) => Promise<LoginResponse>;
  loginStatus: MutationStatus;
  loginError: ApiError | null;
  logout: () => Promise<void>;
  logoutStatus: MutationStatus;
  logoutError: ApiError | null;
  refresh: () => Promise<MetricsResponse | undefined>;
  error: ApiError | null;
  metrics: MetricsResponse | undefined;
}

const fetchSession = async (): Promise<MetricsResponse> => {
  return apiFetch<MetricsResponse>("/metrics", { method: "GET" });
};

export const useAuth = (): UseAuthResult => {
  const {
    data,
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: AUTH_KEY,
    queryFn: fetchSession,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ password }: { password: string }) => {
      console.log("=== DEBUG FRONT LOGIN ===");
      console.log("API base:", import.meta.env.VITE_API_BASE ?? "/api");
      console.log("Password length:", password.length);

      const result = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });

      console.log("Response:", result);
      console.log("============================");
      return result;
    },
    onSuccess: () => {
      void refetch();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () =>
      apiFetch<void>("/auth/logout", {
        method: "POST",
        parseJson: false,
      }),
    onSuccess: () => {
      void refetch();
    },
  });

  const refresh = useCallback(async () => {
    const result = await refetch();
    if (result.status === "success") {
      return result.data;
    }
    return undefined;
  }, [refetch]);

  return {
    isAuthenticated: Boolean(data?.ok),
    isLoading,
    login: (input) => loginMutation.mutateAsync(input),
    loginStatus: loginMutation.status,
    loginError: (loginMutation.error as ApiError | null) ?? null,
    logout: () => logoutMutation.mutateAsync(),
    logoutStatus: logoutMutation.status,
    logoutError: (logoutMutation.error as ApiError | null) ?? null,
    refresh,
    error: (error ?? loginMutation.error ?? logoutMutation.error) as ApiError | null,
    metrics: data,
  };
};


