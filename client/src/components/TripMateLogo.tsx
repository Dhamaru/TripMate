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
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#007AFF', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: '#FF9500', stopOpacity: 1 }} />
            </linearGradient>
          </defs>
          <rect width="100" height="100" rx="20" fill="url(#logo-grad)" />
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
