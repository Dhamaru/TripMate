import { useId } from "react";

interface TripMateLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function TripMateLogo({ size = 'md', showText = true, className = '' }: TripMateLogoProps) {
  // Unique per instance — an SVG gradient id is document-global, so two
  // logos on the same page (e.g. Landing's header + footer) would otherwise
  // collide and the second instance would silently render the first one's
  // (possibly stale, possibly about-to-unmount) gradient.
  const gradientId = `tripmate-logo-gradient-${useId()}`;

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  const textSizeClasses = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl'
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`${sizeClasses[size]} relative flex items-center justify-center`}>
        {/* Same gradient-arrow mark used for the favicon and the Atlas chat
            trigger — one consistent identity across the app instead of three
            different logo designs (this, a plain "T" square, and the
            favicon). */}
        <svg viewBox="0 0 100 100" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1E3A8A" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="50" fill={`url(#${gradientId})`} />
          <path d="M30 35 L70 50 L30 65 L35 50 Z" fill="white" />
        </svg>
      </div>
      {showText && (
        <span className={`font-bold text-foreground ${textSizeClasses[size]}`}>
          TripMate
        </span>
      )}
    </div>
  );
}
