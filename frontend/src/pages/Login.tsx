import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface LocationState {
  from?: Location;
}

export const Login = () => {
  const { login, loginStatus, loginError, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (loginError) {
      toast({
        title: "Login failed",
        description: loginError.message ?? "The password didn't match.",
        variant: "destructive",
      });
    }
  }, [loginError, toast]);

  useEffect(() => {
    if (isAuthenticated) {
      const state = location.state as LocationState | undefined;
      const redirectTo = state?.from?.pathname ?? "/";
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, location.state, navigate]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password.trim()) {
      toast({
        title: "Password required",
        description: "Enter the access password provided by the admin.",
        variant: "destructive",
      });
      return;
    }

    try {
      await login({ password });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Password mismatch.";
      toast({
        title: "Incorrect password",
        description: message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mx-auto">
            <Lock className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <p className="text-sm text-muted-foreground">
            Internal portal. Use the latest access password.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Access password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  disabled={loginStatus === "pending"}
                  autoFocus
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 px-3 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loginStatus === "pending"}>
              {loginStatus === "pending" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                "Sign in"
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Reach out to the portal admin if the password has changed.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;


