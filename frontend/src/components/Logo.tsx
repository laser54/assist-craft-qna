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
        <div className="absolute inset-0 bg-gradient-to-br from-primary to-accent rounded-lg blur-sm opacity-50" />
        <div className="relative bg-gradient-to-br from-primary to-accent p-1.5 rounded-lg">
          <MessageSquare className={`${sizeClasses[size]} text-primary-foreground`} />
          <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-accent-foreground" />
        </div>
      </div>
      {showText && (
        <span className={`font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent ${textSizeClasses[size]}`}>
          Smart FAQ
        </span>
      )}
    </div>
  );
};
