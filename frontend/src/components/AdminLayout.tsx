import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import {
    LayoutDashboard, Building2, Users,
    RefreshCw, Settings2, LogOut, RotateCcw,
    Menu, ChevronDown, ZoomIn, ZoomOut,
    TrendingUp, Github, Key, Wrench, DollarSign, Warehouse, Package, Calendar,
    BarChart3, UserCircle, Activity
} from 'lucide-react';

interface NavItem {
    id: string;
    name: string;
    href: string;
    icon: React.ElementType;
}

interface NavGroup {
    id: string;
    name: string;
    icon: React.ElementType;
    children: { id: string; name: string; href: string; icon: React.ElementType }[];
}

const navItems: NavItem[] = [
    { id: 'dashboard', name: 'لوحة التحكم', href: '/', icon: LayoutDashboard },
    { id: 'branches', name: 'الفروع', href: '/branches', icon: Building2 },
    { id: 'users', name: 'المستخدمين', href: '/users', icon: Users },
    { id: 'analytics', name: 'التحليلات', href: '/analytics', icon: BarChart3 },
];

const reportGroups: NavGroup[] = [
    {
        id: 'financial-reports',
        name: 'المالية',
        icon: DollarSign,
        children: [
            { id: 'financial', name: 'التدقيق المالي', href: '/reports', icon: DollarSign },
            { id: 'payments', name: 'المدفوعات', href: '/reports/payments', icon: DollarSign },
            { id: 'sales', name: 'المبيعات', href: '/reports/sales', icon: DollarSign },
            { id: 'installments', name: 'الأقساط', href: '/reports/installments', icon: Calendar },
        ]
    },
    {
        id: 'operations-reports',
        name: 'العمليات',
        icon: Wrench,
        children: [
            { id: 'movements', name: 'حركات المخزون', href: '/reports/movements', icon: RefreshCw },
            { id: 'requests', name: 'طلبات الصيانة', href: '/reports/requests', icon: Wrench },
            { id: 'inventory', name: 'جرد المخزون', href: '/reports/inventory', icon: Warehouse },
        ]
    },
    {
        id: 'assets-reports',
        name: 'الأصول',
        icon: Package,
        children: [
            { id: 'simcards', name: 'الشرائح', href: '/reports/simcards', icon: Package },
            { id: 'spare-parts', name: 'قطع الغيار', href: '/reports/spare-parts', icon: Package },
            { id: 'price-history', name: 'سعر القطع', href: '/reports/price-history', icon: TrendingUp },
        ]
    },
];

const utilityItems: NavItem[] = [
    { id: 'software-updates', name: 'التحديثات', href: '/software-updates', icon: Github },
    { id: 'license-manager', name: 'التراخيص', href: '/license-manager', icon: Key },
    { id: 'sync-status', name: 'المزامنة', href: '/sync-status', icon: RefreshCw },
    { id: 'sync-monitoring', name: 'مراقبة المزامنة', href: '/sync-monitoring', icon: Activity },
    { id: 'version-logs', name: 'الإصدارات', href: '/version-logs', icon: RotateCcw },
    { id: 'settings', name: 'الإعدادات', href: '/settings', icon: Settings2 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<string[]>(['financial-reports']);
    const [zoomLevel, setZoomLevel] = useState(100);

    const toggleGroup = (id: string) => {
        setExpandedGroups(prev =>
            prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
        );
    };

    const isActive = (href: string) => {
        if (href === '/') return location.pathname === '/';
        return location.pathname === href || location.pathname.startsWith(href + '/');
    };

    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 5, 150));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 5, 70));

    return (
        <div className="flex bg-background text-foreground overflow-hidden h-screen" dir="rtl">
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <aside className={`
                fixed top-0 bottom-0 right-0 z-50 h-full
                transition-all duration-300 ease-in-out
                bg-card border-l border-border shadow-2xl
                group peer
                ${isSidebarOpen ? 'translate-x-0 w-72' : 'translate-x-full w-72'}
                lg:translate-x-0 lg:w-20 lg:hover:w-72
            `}>
                <div className="h-full flex flex-col overflow-hidden">
                    <div className="p-4 flex flex-col items-center justify-center border-b border-border/50 min-h-[80px]">
                        <img
                            src="/logo.png"
                            alt="Brand Logo"
                            className="h-10 w-auto object-contain transition-transform group-hover:scale-110"
                        />
                        <p className="mt-2 text-[10px] font-black text-primary/60 tracking-[0.2em] uppercase font-inter whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 absolute bottom-2">
                            SMART ENTERPRISE
                        </p>
                    </div>

                    <nav className="flex-1 px-2 py-2 space-y-2 overflow-y-auto custom-scroll overflow-x-hidden">
                        {navItems.map(item => {
                            const Icon = item.icon;
                            const active = isActive(item.href);
                            return (
                                <Link
                                    key={item.id}
                                    to={item.href}
                                    onClick={() => setIsSidebarOpen(false)}
                                    className={`flex items-center px-3 py-3 rounded-xl transition-all relative overflow-hidden whitespace-nowrap ${active
                                        ? 'bg-primary text-white shadow-lg ring-1 ring-primary/20'
                                        : 'text-slate-900 hover:bg-slate-100 hover:text-primary'
                                        }`}
                                >
                                    <div className="flex items-center justify-center min-w-[24px]">
                                        <Icon size={22} className={active ? 'text-white' : 'text-slate-700'} />
                                    </div>
                                    <span className={`mr-3 text-sm ${active ? 'font-black' : 'font-bold'} flex-1`}>
                                        {item.name}
                                    </span>
                                </Link>
                            );
                        })}

                        {reportGroups.map(group => {
                            const GroupIcon = group.icon;
                            const isExpanded = expandedGroups.includes(group.id);
                            const hasActiveChild = group.children.some(c => isActive(c.href));

                            return (
                                <div key={group.id} className="space-y-1">
                                    <button
                                        onClick={() => toggleGroup(group.id)}
                                        className={`
                                            w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200
                                            ${hasActiveChild || isExpanded
                                                ? 'text-slate-900 bg-slate-100' 
                                                : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'}
                                        `}
                                    >
                                        <GroupIcon size={14} strokeWidth={1.8} className="shrink-0" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap opacity-100 flex-1 text-right text-slate-700">
                                            {group.name}
                                        </span>
                                        <ChevronDown size={10} className={`shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>

                                    <div className={`
                                        overflow-hidden transition-all duration-300
                                        ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
                                    `}>
                                        <div className="pr-10 pl-2 space-y-1 mt-1 mb-2 border-r-2 border-primary/10 mr-4">
                                            {group.children.map(child => {
                                                const ChildIcon = child.icon;
                                                const childActive = isActive(child.href);
                                                return (
                                                    <Link
                                                        key={child.id}
                                                        to={child.href}
                                                        onClick={() => setIsSidebarOpen(false)}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${childActive
                                                            ? 'bg-primary/10 text-primary'
                                                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                                                            }`}
                                                    >
                                                        <ChildIcon size={14} className="opacity-50" />
                                                        <span>{child.name}</span>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        <div className="border-t border-border/50 my-2" />

                        {utilityItems.map(item => {
                            const Icon = item.icon;
                            const active = isActive(item.href);
                            return (
                                <Link
                                    key={item.id}
                                    to={item.href}
                                    onClick={() => setIsSidebarOpen(false)}
                                    className={`flex items-center px-3 py-3 rounded-xl transition-all relative overflow-hidden whitespace-nowrap ${active
                                        ? 'bg-primary text-white shadow-lg ring-1 ring-primary/20'
                                        : 'text-slate-900 hover:bg-slate-100 hover:text-primary'
                                        }`}
                                >
                                    <div className="flex items-center justify-center min-w-[24px]">
                                        <Icon size={22} className={active ? 'text-white' : 'text-slate-700'} />
                                    </div>
                                    <span className={`mr-3 text-sm ${active ? 'font-black' : 'font-bold'} flex-1`}>
                                        {item.name}
                                    </span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="p-4 border-t border-border/50 bg-muted/20">
                        <div className="text-[9px] text-muted-foreground/30 text-center mb-2 font-mono">v1.1.0</div>
                        <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
                                <UserCircle size={20} />
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <p className="text-[11px] font-black leading-tight truncate max-w-[140px]">{user?.displayName}</p>
                                <p className="text-[9px] font-bold text-muted-foreground opacity-60 uppercase">{user?.role}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => { logout(); navigate('/login'); }}
                            className="w-full mt-2 flex items-center gap-2 px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                            <LogOut size={14} />
                            <span>تسجيل الخروج</span>
                        </button>
                    </div>
                </div>
            </aside>

            <main className={`
                flex-1 flex flex-col min-w-0 relative transition-all duration-300
                lg:mr-20 lg:peer-hover:mr-72 transition-all duration-300
            `}>
                <header className="h-16 lg:h-14 flex items-center justify-between px-4 lg:px-8 shrink-0 relative z-30 bg-card border-b">
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2 -mr-2 text-foreground/70 hover:bg-muted rounded-lg lg:hidden"
                    >
                        <Menu size={24} />
                    </button>

                    <div className="lg:hidden flex items-center gap-2">
                        <img src="/logo.png" alt="Logo" className="h-8 w-auto" />
                    </div>

                    <div className="flex items-center gap-2 lg:gap-3 ml-auto">
                        <div className="flex items-center gap-1">
                            <button onClick={handleZoomOut} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                                <ZoomOut size={14} />
                            </button>
                            <span className="text-[10px] font-bold text-muted-foreground w-10 text-center">{zoomLevel}%</span>
                            <button onClick={handleZoomIn} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                                <ZoomIn size={14} />
                            </button>
                        </div>

                        <div className="relative">
                            <button
                                onClick={() => setIsProfileOpen(!isProfileOpen)}
                                className="flex items-center gap-2 p-1 lg:p-1.5 hover:bg-muted rounded-full transition-all border border-transparent hover:border-border"
                            >
                                <ChevronDown size={14} className={`transition-transform duration-300 opacity-30 ${isProfileOpen ? 'rotate-180' : ''}`} />
                                <div className="hidden md:block text-right ml-1">
                                    <p className="text-[11px] font-black leading-tight truncate max-w-30">{user?.displayName || 'مستخدم'}</p>
                                    <p className="text-[9px] font-bold text-muted-foreground opacity-60 uppercase tracking-tighter truncate max-w-25">{user?.role || 'Guest'}</p>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
                                    <UserCircle size={20} />
                                </div>
                            </button>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto bg-transparent p-4 lg:p-8 lg:pt-4 custom-scroll relative">
                    <div
                        className="max-w-full mx-auto animate-fade-in pb-20 lg:pb-0"
                        style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top right', transition: 'transform 0.2s ease' }}
                    >
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
}
