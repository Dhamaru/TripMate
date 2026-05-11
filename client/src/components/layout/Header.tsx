import { useLocation } from 'wouter'
import { useAuthStore } from '../../store'

export function Header() {
    const [pathname, navigate] = useLocation()
    const { user } = useAuthStore()
    const isAuthPage = ['/signin', '/signup'].includes(pathname)
    if (isAuthPage) return null

    const navItems = [
        { path: '/', label: 'Trips' },
        { path: '/plan', label: '+ Plan' },
    ]

    return (
        <header className="fixed top-0 left-0 right-0 z-30 
                       bg-[#0a0a0a]/80 backdrop-blur-md 
                       border-b border-white/5 h-14">
            <div className="max-w-6xl mx-auto px-4 h-full 
                      flex items-center justify-between">
                <button onClick={() => navigate('/')}
                    className="flex items-center gap-2 text-white font-semibold"
                    aria-label="TripMate home">
                    <span aria-hidden="true">🌍</span>
                    <span className="text-sm font-bold">TripMate</span>
                </button>

                <nav className="flex items-center gap-1" aria-label="Main navigation">
                    {navItems.map(item => (
                        <button key={item.path}
                            onClick={() => navigate(item.path)}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors
                         ${pathname === item.path
                                    ? 'bg-white/10 text-white'
                                    : 'text-gray-400 hover:text-white'}`}
                            aria-current={pathname === item.path ? 'page' : undefined}
                            aria-label={item.label}>
                            {item.label}
                        </button>
                    ))}
                </nav>

                <button onClick={() => navigate('/profile')}
                    className="w-8 h-8 rounded-full bg-white/10 border border-white/10
                           flex items-center justify-center text-sm text-white
                           hover:bg-white/20 transition-colors overflow-hidden"
                    aria-label="Go to profile">
                    {user?.avatar
                        ? <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                        : <span>{user?.firstName?.[0]?.toUpperCase() ?? '?'}</span>
                    }
                </button>
            </div>
        </header>
    )
}
