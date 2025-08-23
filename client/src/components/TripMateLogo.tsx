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

  const iconSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-lg'
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`${sizeClasses[size]} bg-gradient-to-br from-ios-blue to-ios-orange rounded-lg flex items-center justify-center`}>
        <i className={`fas fa-plane text-white ${iconSizeClasses[size]}`}></i>
      </div>
      {showText && (
        <span className={`font-bold text-white ${textSizeClasses[size]}`}>
          TripMate
        </span>
      )}
    </div>
  );
}
