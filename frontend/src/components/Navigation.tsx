import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, FileText, Settings, Menu } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export const Navigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: "/", label: "Search", icon: Home },
    { path: "/qa-management", label: "Q&A Management", icon: FileText },
    { path: "/settings", label: "Settings", icon: Settings },
  ];

  const handleNavClick = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-4">
          <div 
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" 
            onClick={() => handleNavClick("/")}
          >
            <Logo size="md" />
            <span className="hidden sm:inline-block text-lg font-semibold text-primary">
              Support Assistant
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                return (
                  <Button
                    key={item.path}
                    variant={isActive ? "default" : "ghost"}
                    onClick={() => handleNavClick(item.path)}
                    className={cn(
                      "gap-2 transition-all",
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-sm" 
                        : "hover:bg-muted/50"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Button>
                );
              })}
            </div>

            {/* Theme Toggle */}
            <div className="hidden sm:block ml-2 pl-2 border-l">
              <ThemeToggle />
            </div>

            {/* Mobile Menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] sm:w-[320px]">
                <div className="flex flex-col gap-4 mt-6">
                  <div className="flex items-center gap-2 pb-4 border-b">
                    <Logo size="md" />
                    <span className="text-lg font-semibold">Support Assistant</span>
                  </div>
                  
                  <nav className="flex flex-col gap-2">
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.path;

                      return (
                        <Button
                          key={item.path}
                          variant={isActive ? "default" : "ghost"}
                          onClick={() => handleNavClick(item.path)}
                          className={cn(
                            "justify-start gap-3 w-full",
                            isActive && "bg-primary text-primary-foreground"
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          <span>{item.label}</span>
                        </Button>
                      );
                    })}
                  </nav>

                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Theme</span>
                      <ThemeToggle />
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
};
