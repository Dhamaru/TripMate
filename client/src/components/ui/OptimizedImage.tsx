import { useState } from 'react'

interface Props {
    src: string
    alt: string
    className?: string
    fallback?: React.ReactNode
}

export function OptimizedImage({ src, alt, className, fallback }: Props) {
    const [error, setError] = useState(false)
    const [loaded, setLoaded] = useState(false)

    if (error) return <>{fallback ?? <div className={className} aria-label={alt} />}</>

    return (
        <div className={`relative overflow-hidden ${className ?? ''}`}>
            {!loaded && (
                <div className="absolute inset-0 bg-white/5 animate-pulse" aria-hidden="true" />
            )}
            <img
                src={src}
                alt={alt}
                loading="lazy"
                decoding="async"
                onLoad={() => setLoaded(true)}
                onError={() => setError(true)}
                className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            />
        </div>
    )
}
