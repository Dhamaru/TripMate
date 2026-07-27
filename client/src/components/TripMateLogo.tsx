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
          <rect width="100" height="100" rx="20" fill="#0D1B2E" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="#B3261E" strokeWidth="4" />
          <path d="M50 26 L50 74 M26 50 L74 50" stroke="#B3261E" strokeWidth="2.5" />
          <path d="M50 34 L58 50 L50 66 L42 50 Z" fill="#B3261E" />
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
