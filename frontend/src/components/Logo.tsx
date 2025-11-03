import { MessageSquare, Sparkles } from "lucide-react";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export const Logo = ({ size = "md", showText = true }: LogoProps) => {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };

  const textSizeClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 rounded-lg blur-sm opacity-50" />
        <div className="relative bg-primary p-1.5 rounded-lg">
          <MessageSquare className={`${sizeClasses[size]} text-primary-foreground`} />
          <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-accent drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
        </div>
      </div>
      {showText && (
        <span className={`font-bold text-primary ${textSizeClasses[size]}`}>
          Smart FAQ
        </span>
      )}
    </div>
  );
};
