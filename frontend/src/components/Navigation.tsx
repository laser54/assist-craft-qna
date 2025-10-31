import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Home, FileText, Settings, Zap } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

export const Navigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { metrics } = useAuth();
  const rerankUsage = metrics?.rerankUsage;
  const limit = rerankUsage?.limit ?? null;
  const remaining = rerankUsage?.remaining ?? null;
  const unitsUsed = rerankUsage?.unitsUsed ?? null;

  const badgeVariant: "secondary" | "destructive" =
    remaining == null || limit == null
      ? "secondary"
      : remaining <= Math.max(5, Math.ceil(limit * 0.1))
        ? "destructive"
        : "secondary";

  const navItems = [
    { path: "/", label: "Search", icon: Home },
    { path: "/qa-management", label: "Q&A Management", icon: FileText },
    { path: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-4">
          <div className="flex items-center cursor-pointer" onClick={() => navigate("/")}>
            <Logo size="md" />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                return (
                  <Button
                    key={item.path}
                    variant={isActive ? "default" : "ghost"}
                    onClick={() => navigate(item.path)}
                    className={cn("gap-2", isActive && "bg-primary text-primary-foreground")}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Button>
                );
              })}
            </div>

            {rerankUsage ? (
              <div className="flex items-center gap-2 min-w-[140px]">
                <Badge
                  variant={badgeVariant}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px]"
                  title={
                    limit != null
                      ? `${unitsUsed ?? 0} of ${limit} rerank credits used today`
                      : `${unitsUsed ?? 0} rerank credits used today`
                  }
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>
                    {limit != null
                      ? `${remaining ?? 0}/${limit} left`
                      : `${unitsUsed ?? 0} used`}
                  </span>
                </Badge>
                {limit != null ? (
                  <Progress
                    value={Math.min(100, Math.round(((limit - (remaining ?? 0)) / limit) * 100))}
                    className="h-1.5 w-16"
                  />
                ) : null}
              </div>
            ) : null}

            <div className="ml-2 pl-2 border-l">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};
