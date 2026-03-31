import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import {
    LayoutDashboard, Building2, Users, Layers,
    RefreshCw, Settings2, LogOut, RotateCcw,
    UserCircle, Menu, ChevronDown, ZoomIn, ZoomOut,
    TrendingUp, Github, Key
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
    { id: 'customers', name: 'إدارة العملاء', href: '/customers', icon: UserCircle },
    { id: 'admin-store', name: 'المخازن الإدارية', href: '/admin-store', icon: Layers },
    { id: 'warehouse', name: 'مخازن الفروع', href: '/warehouse', icon: Layers },
    { id: 'software-updates', name: 'تحديثات النظام', href: '/software-updates', icon: Github },
    { id: 'license-manager', name: 'تراخيص الفروع', href: '/license-manager', icon: Key },
    { id: 'reports', name: 'التقارير والتصدير', href: '/reports', icon: TrendingUp },
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
                transition-all duration-500 ease-in-out
                bg-gradient-to-b from-[#0A2472] via-[#0A2472] to-[#061B54] 
                backdrop-blur-xl text-white
                border-l border-white/10 shadow-[20px_0_60px_rgba(0,0,0,0.4)]
                group peer
                ${isSidebarOpen ? 'translate-x-0 w-72' : 'translate-x-full w-72'}
                lg:translate-x-0 lg:w-20 lg:hover:w-72
            `}>
                <div className="h-full flex flex-col overflow-hidden">
                    {/* Brand / Logo Section */}
                    <div className="p-4 flex flex-col items-center justify-center border-b border-white/10 min-h-[85px] lg:min-h-[80px] relative transition-all duration-500 group-hover:min-h-[180px] overflow-hidden bg-white/5">
                        {/* Animated background glow */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-cyan-400/20 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                        
                        <div className="relative z-10 flex flex-col items-center">
                            <div className="bg-white/10 p-2 rounded-2xl backdrop-blur-md border border-white/20 shadow-lg transition-all duration-500 group-hover:scale-110 group-hover:bg-white/15">
                                <img
                                    src="/logo.png"
                                    alt="Smart Enterprise"
                                    className="h-10 w-auto object-contain drop-shadow-[0_0_15px_rgba(108,228,240,0.4)]"
                                />
                            </div>
                            
                            <div className="mt-5 flex flex-col items-center opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-700 pointer-events-none delay-100">
                                <h1 className="text-sm font-black text-white tracking-[0.3em] uppercase whitespace-nowrap bg-gradient-to-r from-white via-cyan-100 to-white bg-clip-text text-transparent">
                                    Smart Enterprise
                                </h1>
                                <div className="h-0.5 w-12 bg-gradient-to-r from-transparent via-cyan-400 to-transparent mt-2 rounded-full shadow-[0_0_15px_rgba(108,228,240,0.8)]" />
                                <p className="mt-2.5 text-[10px] font-black text-cyan-400/70 uppercase tracking-[0.4em] whitespace-nowrap">
                                    Executive Suite
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation Items */}
                    <nav className="flex-1 px-4 py-8 space-y-2.5 overflow-y-auto custom-scrollbar overflow-x-hidden">
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
                                    className={`w-full flex items-center px-3 py-3.5 rounded-2xl transition-all duration-300 relative group/item overflow-hidden whitespace-nowrap ${
                                        isActive
                                            ? 'bg-white/10 text-cyan-400 shadow-[0_4px_20px_rgba(0,0,0,0.2)] border border-white/10'
                                            : 'text-white/50 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {/* Active Indicator Line */}
                                    <div className={`absolute right-0 top-1 bottom-1 w-1 rounded-l-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,1)] transition-all duration-500 ${isActive ? 'h-auto opacity-100' : 'h-0 opacity-0 group-hover/item:h-auto group-hover/item:opacity-50'}`} />
                                    
                                    <div className={`flex items-center justify-center min-w-[24px] transition-all duration-300 ${isActive ? 'scale-110 drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]' : 'group-hover/item:scale-110'}`}>
                                        <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-cyan-400' : 'opacity-70'} />
                                    </div>
                                    
                                    <span className={`mr-4 text-[13px] tracking-normal transition-all duration-500 ${isActive ? 'font-black text-white' : 'font-bold opacity-0 group-hover:opacity-100'} flex-1 text-right`}>
                                        {item.name}
                                    </span>

                                    {isActive && (
                                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent pointer-events-none animate-pulse" />
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Footer / User Info */}
                    <div className="p-5 border-t border-white/5 bg-black/20">
                        <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap mb-4">
                            <div className="relative group/avatar">
                                <div className="absolute -inset-1 bg-gradient-to-tr from-cyan-500 to-blue-500 rounded-lg blur opacity-20 group-hover/avatar:opacity-40 transition duration-500" />
                                <div className="relative w-9 h-9 rounded-lg bg-[#0A2472] flex items-center justify-center text-cyan-400 shrink-0 border border-white/10 shadow-inner">
                                    <UserCircle size={22} />
                                </div>
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-4 group-hover:translate-x-0">
                                <p className="text-[11px] font-black text-white leading-tight truncate max-w-[140px] uppercase tracking-tighter">{user?.displayName}</p>
                                <p className="text-[9px] font-black text-cyan-400/50 uppercase tracking-widest mt-0.5">{user?.role}</p>
                            </div>
                        </div>

                        {/* Logout */}
                        <button
                            onClick={logout}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 opacity-0 group-hover:opacity-100"
                        >
                            <LogOut size={16} />
                                <span className="text-[10px] font-black uppercase tracking-widest">إنهاء الجلسة</span>
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
                <header className="h-16 lg:h-16 flex items-center justify-between px-4 lg:px-8 shrink-0 relative z-30 bg-white/70 backdrop-blur-md border-b border-gray-200/50 shadow-sm">

                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2.5 text-navy-900/70 hover:bg-navy-50 rounded-xl lg:hidden transition-colors"
                    >
                        <Menu size={24} />
                    </button>

                    <div className="lg:hidden flex items-center gap-3">
                        <div className="bg-navy-900 p-1.5 rounded-lg shadow-md">
                            <img src="/logo.png" alt="Logo" className="h-6 w-auto brightness-110" />
                        </div>
                        <span className="text-[10px] font-black text-navy-900/40 uppercase tracking-[0.2em]">SES Admin</span>
                    </div>

                    {/* Page Title - Desktop */}
                    <div className="hidden lg:flex items-center gap-4">
                        <div className="w-1.5 h-8 bg-gradient-to-b from-[#0A2472] to-[#061B54] rounded-full shadow-sm" />
                        <div className="flex flex-col">
                            <h2 className="font-black text-xl text-[#0A2472] tracking-tight leading-none">
                                {pageTitle}
                            </h2>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.3em] mt-1.5">
                                Smart Enterprise Portal
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 lg:gap-5 mr-auto">
                        {/* System Status Badge */}
                        <div className="hidden sm:flex items-center gap-2.5 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-100/50 shadow-sm group cursor-help">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">النظام نشط</span>
                        </div>

                        {/* User Profile Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setIsProfileOpen(!isProfileOpen)}
                                className="flex items-center gap-3 p-1.5 hover:bg-gray-50 rounded-2xl transition-all border border-transparent hover:border-gray-100 group"
                            >
                                <ChevronDown size={14} className={`transition-transform duration-500 text-gray-400 ${isProfileOpen ? 'rotate-180' : 'group-hover:translate-y-0.5'}`} />
                                <div className="hidden md:block text-right ml-1">
                                    <p className="text-xs font-black text-[#0A2472] leading-tight truncate max-w-[120px]">{user?.displayName}</p>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter mt-0.5">{user?.role}</p>
                                </div>
                                <div className="relative">
                                    <div className="absolute -inset-0.5 bg-gradient-to-tr from-[#0A2472] to-cyan-500 rounded-full blur opacity-10 group-hover:opacity-30 transition duration-500" />
                                    <div className="relative w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#0A2472] shrink-0 border border-gray-100 shadow-sm group-hover:shadow-md transition-all">
                                        <UserCircle size={24} strokeWidth={1.5} />
                                    </div>
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
