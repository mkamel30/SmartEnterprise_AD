import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import {
    LayoutDashboard, Building2, Users, Layers,
    Activity,     RefreshCw, Settings2, LogOut, RotateCcw,
    UserCircle, Menu, ChevronDown, ZoomIn, ZoomOut,
    Bell, ShieldCheck
} from 'lucide-react';

interface NavItem {
    id: string;
    name: string;
    href: string;
    icon: React.ElementType;
    badge?: number;
}

const allNavItems: NavItem[] = [
    { id: 'dashboard', name: 'لوحة التحكم المركزية', href: '/', icon: LayoutDashboard },
    { id: 'branches', name: 'شبكة الفروع', href: '/branches', icon: Building2 },
    { id: 'users', name: 'إدارة المستخدمين', href: '/users', icon: Users },
    { id: 'warehouse', name: 'مخازن الأجهزة والعهد', href: '/warehouse', icon: Layers },
    { id: 'sync-status', name: 'مراقب المزامنة', href: '/sync-status', icon: RefreshCw },
    { id: 'version-logs', name: 'سجلات الإصدارات', href: '/version-logs', icon: RotateCcw },
    { id: 'settings', name: 'الإعدادات والتكوين', href: '/settings', icon: Settings2 },
];

interface AdminLayoutProps {
    children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(100);

    const activeTab = location.pathname === '/' ? 'dashboard' : location.pathname.split('/')[1];

    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 5, 150));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 5, 70));

    const pageTitle = allNavItems.find(n => n.id === activeTab)?.name || 'اللوحة الرئيسية';

    return (
        <div className="flex bg-background text-foreground overflow-hidden h-screen" dir="rtl">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm transition-opacity lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Navigation Drawer (Sidebar) */}
            <aside className={`
                fixed top-0 bottom-0 right-0 z-50 h-full
                transition-all duration-300 ease-in-out
                bg-gradient-to-br from-[#5536A7] to-[#0A2472] text-white
                border-l border-white/10 shadow-2xl
                group peer
                ${isSidebarOpen ? 'translate-x-0 w-72' : 'translate-x-full w-72'}
                lg:translate-x-0 lg:w-20 lg:hover:w-72
            `}>
                <div className="h-full flex flex-col overflow-hidden">
                    {/* Brand */}
                    <div className="p-4 flex flex-col items-center justify-center border-b border-white/10 min-h-[72px] relative">
                        <img
                            src="/logo.png"
                            alt="Smart Enterprise"
                            className="h-9 w-auto object-contain transition-transform group-hover:scale-110"
                        />
                        <p className="mt-2 text-[10px] font-black text-white/40 tracking-[0.2em] uppercase whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            SMART ENTERPRISE
                        </p>
                        <p className="absolute bottom-1.5 text-[9px] font-black text-white/30 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                            بوابة المدير العام
                        </p>
                    </div>

                    {/* Navigation Items */}
                    <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto custom-scrollbar overflow-x-hidden">
                        {allNavItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeTab === item.id;

                            return (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        navigate(item.href);
                                        setIsSidebarOpen(false);
                                    }}
                                    className={`w-full flex items-center px-3 py-3 rounded-xl transition-all relative overflow-hidden whitespace-nowrap ${
                                        isActive
                                            ? 'bg-white text-[#0A2472] shadow-lg ring-1 ring-white/20'
                                            : 'text-white/60 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <div className="flex items-center justify-center min-w-[24px]">
                                        <Icon size={22} className={isActive ? 'text-[#0A2472]' : 'opacity-50 group-hover:opacity-80'} />
                                    </div>
                                    <span className={`mr-3 text-sm ${isActive ? 'font-black' : 'font-bold'} opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex-1 text-right`}>
                                        {item.name}
                                    </span>
                                    {isActive && (
                                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-[#6CE4F0] rounded-l-full opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Footer / User Info */}
                    <div className="p-4 border-t border-white/10">
                        <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0 border border-white/20">
                                <UserCircle size={20} />
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <p className="text-[11px] font-black leading-tight truncate max-w-[140px]">{user?.displayName}</p>
                                <p className="text-[9px] font-bold text-white/40 uppercase">{user?.role}</p>
                            </div>
                        </div>

                        {/* Logout */}
                        <button
                            onClick={logout}
                            className="mt-3 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-all opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        >
                            <LogOut size={16} />
                            <span className="text-xs font-bold">إنهاء الجلسة</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className={`
                flex-1 flex flex-col min-w-0 relative transition-all duration-300
                lg:mr-20 lg:peer-hover:mr-72
            `}>
                {/* Top App Bar */}
                <header className="h-16 lg:h-14 flex items-center justify-between px-4 lg:px-8 shrink-0 relative z-30 bg-card border-b border-border/50">

                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2 text-foreground/70 hover:bg-muted rounded-lg lg:hidden"
                    >
                        <Menu size={24} />
                    </button>

                    <div className="lg:hidden flex items-center gap-2">
                        <img src="/logo.png" alt="Logo" className="h-8 w-auto" />
                        <span className="text-xs font-black text-primary/60">SES Admin</span>
                    </div>

                    {/* Page Title - Desktop */}
                    <div className="hidden lg:flex items-center gap-3">
                        <div className="w-1.5 h-7 bg-primary rounded-full" />
                        <h2 className="font-black text-lg text-primary tracking-tight">
                            {pageTitle}
                        </h2>
                    </div>

                    <div className="flex items-center gap-2 lg:gap-3 mr-auto">
                        {/* System Status Badge */}
                        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/20">
                            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                            <span className="text-[10px] font-black text-success uppercase tracking-widest">متصل</span>
                        </div>

                        {/* Security Badge */}
                        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10">
                            <ShieldCheck size={12} className="text-primary" />
                            <span className="text-[9px] font-black text-primary uppercase tracking-widest">{user?.role}</span>
                        </div>

                        {/* User Profile Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setIsProfileOpen(!isProfileOpen)}
                                className="flex items-center gap-2 p-1 hover:bg-muted rounded-full transition-all border border-transparent hover:border-border"
                            >
                                <ChevronDown size={14} className={`transition-transform duration-300 opacity-30 ${isProfileOpen ? 'rotate-180' : ''}`} />
                                <div className="hidden md:block text-right ml-1">
                                    <p className="text-[11px] font-black leading-tight truncate max-w-30">{user?.displayName}</p>
                                    <p className="text-[9px] font-bold text-muted-foreground opacity-60 uppercase tracking-tighter">{user?.role}</p>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
                                    <UserCircle size={20} />
                                </div>
                            </button>

                            {isProfileOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setIsProfileOpen(false)} />
                                    <div className="absolute left-0 mt-3 w-64 bg-card rounded-xl shadow-2xl border border-border p-2 z-50">
                                        <div className="p-4 mb-2 border-b border-border/50 text-right">
                                            <p className="text-sm font-black text-foreground">{user?.displayName}</p>
                                            <p className="text-[10px] text-muted-foreground font-bold uppercase mt-0.5">{user?.email}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Link
                                                to="/settings"
                                                onClick={() => setIsProfileOpen(false)}
                                                className="flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-foreground/70 hover:bg-muted rounded-xl transition-all"
                                            >
                                                <Settings2 size={16} className="opacity-50" />
                                                <span>الإعدادات</span>
                                            </Link>
                                            <button
                                                onClick={() => { logout(); navigate('/login'); }}
                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-destructive hover:bg-destructive/10 rounded-xl transition-all"
                                            >
                                                <LogOut size={16} />
                                                <span>تسجيل الخروج</span>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* Content Body with Zoom */}
                <main className="flex-1 overflow-y-auto bg-background/50 custom-scrollbar relative">
                    <div
                        className="max-w-full mx-auto animate-fade-in"
                        style={{ zoom: zoomLevel / 100 }}
                    >
                        {children}
                    </div>

                    {/* Floating Zoom Controls */}
                    <div className="fixed bottom-6 left-4 flex flex-col gap-1 z-40">
                        <button
                            onClick={handleZoomIn}
                            disabled={zoomLevel >= 150}
                            className="p-2 bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                            title={`تكبير (${zoomLevel}%)`}
                        >
                            <ZoomIn size={16} />
                        </button>
                        <button
                            onClick={handleZoomOut}
                            disabled={zoomLevel <= 70}
                            className="p-2 bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                            title={`تصغير (${zoomLevel}%)`}
                        >
                            <ZoomOut size={16} />
                        </button>
                        {zoomLevel !== 100 && (
                            <button
                                onClick={() => setZoomLevel(100)}
                                className="text-[9px] font-bold text-muted-foreground hover:text-foreground text-center py-1"
                                title="إعادة تعيين"
                            >
                                {zoomLevel}%
                            </button>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
