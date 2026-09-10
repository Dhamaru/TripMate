interface TripMateLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function TripMateLogo({ size = 'md', showText = true, className = '' }: TripMateLogoProps) {
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
        {/* Orange rounded square + white paper-plane — matches the favicon
            and the PWA app icons (client/public/pwa-*.png) so the tab icon,
            the installed-app icon and this in-app mark are one identity. */}
        <svg viewBox="0 0 100 100" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="6" width="88" height="88" rx="22" fill="#c2410c" />
          <path d="M20 80 L80 50 L20 20 L33 50 Z" fill="white" />
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
