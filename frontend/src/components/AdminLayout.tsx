import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import {
    LayoutDashboard, Building2, Users,
    RefreshCw, Settings2, LogOut, RotateCcw,
    Menu, ChevronDown, ZoomIn, ZoomOut,
    TrendingUp, Github, Key, Wrench, DollarSign, Warehouse, Package, Calendar
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
    { id: 'software-updates', name: 'تحديثات النظام', href: '/software-updates', icon: Github },
    { id: 'license-manager', name: 'تراخيص الفروع', href: '/license-manager', icon: Key },
    { id: 'sync-status', name: 'مراقب المزامنة', href: '/sync-status', icon: RefreshCw },
    { id: 'version-logs', name: 'سجلات الإصدارات', href: '/version-logs', icon: RotateCcw },
    { id: 'settings', name: 'الإعدادات والتكوين', href: '/settings', icon: Settings2 },
];

const reportGroups: { id: string; name: string; icon: React.ElementType; children: { id: string; name: string; href: string; icon: React.ElementType }[] }[] = [
    {
        id: 'financial-reports',
        name: 'التقارير المالية',
        icon: DollarSign,
        children: [
            { id: 'financial', name: 'التدقيق المالي', href: '/reports', icon: DollarSign },
            { id: 'payments', name: 'المدفوعات', href: '/reports/payments', icon: DollarSign },
            { id: 'sales', name: 'المبيعات', href: '/reports/sales', icon: DollarSign },
            { id: 'installments', name: 'الأقساط المتأخرة', href: '/reports/installments', icon: Calendar },
        ]
    },
    {
        id: 'operations-reports',
        name: 'تقارير العمليات',
        icon: Wrench,
        children: [
            { id: 'movements', name: 'حركات المخزون', href: '/reports/movements', icon: RefreshCw },
            { id: 'requests', name: 'طلبات الصيانة', href: '/reports/requests', icon: Wrench },
            { id: 'inventory', name: 'جرد المخزون', href: '/reports/inventory', icon: Warehouse },
        ]
    },
    {
        id: 'assets-reports',
        name: 'تقارير الأصول',
        icon: Package,
        children: [
            { id: 'simcards', name: 'الشرائح', href: '/reports/simcards', icon: Package },
            { id: 'price-history', name: 'سعر القطع', href: '/reports/price-history', icon: TrendingUp },
        ]
    },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(100);
    const [isReportsOpen, setIsReportsOpen] = useState<Record<string, boolean>>({});

    const activeTab = location.pathname === '/' ? 'dashboard' : location.pathname.split('/')[1];
    const isReportPage = location.pathname.startsWith('/reports');

    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 5, 150));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 5, 70));

    const toggleReportGroup = (groupId: string) => {
        setIsReportsOpen(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    };

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

                    {/* Navigation Links */}
                    <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                        {allNavItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeTab === item.id;
                            return (
                                <Link
                                    key={item.id}
                                    to={item.href}
                                    onClick={() => setIsSidebarOpen(false)}
                                    className={`
                                        flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300
                                        ${isActive 
                                            ? 'bg-white/15 text-cyan-300 shadow-[0_0_20px_rgba(108,228,240,0.15)]' 
                                            : 'text-white/60 hover:bg-white/10 hover:text-white'}
                                    `}
                                >
                                    <Icon size={18} strokeWidth={2} className="shrink-0 transition-all duration-500 group-hover:scale-110" />
                                    <span className="text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-all duration-500 opacity-0 lg:opacity-0 lg:group-hover:opacity-100">
                                        {item.name}
                                    </span>
                                </Link>
                            );
                        })}

                        {/* Reports Dropdown with Groups */}
                        <div>
                            <button
                                onClick={() => {
                                    const allOpen = reportGroups.every(g => isReportsOpen[g.id]);
                                    const newState = !allOpen;
                                    const newStateMap: Record<string, boolean> = {};
                                    reportGroups.forEach(g => { newStateMap[g.id] = newState; });
                                    setIsReportsOpen(newStateMap);
                                }}
                                className={`
                                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300
                                    ${(isReportPage || Object.values(isReportsOpen).some(Boolean)) 
                                        ? 'bg-white/15 text-cyan-300 shadow-[0_0_20px_rgba(108,228,240,0.15)]' 
                                        : 'text-white/60 hover:bg-white/10 hover:text-white'}
                                `}
                            >
                                <TrendingUp size={18} strokeWidth={2} className="shrink-0 transition-all duration-500 group-hover:scale-110" />
                                <span className="text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-all duration-500 opacity-0 lg:opacity-0 lg:group-hover:opacity-100 flex-1 text-right">
                                    التقارير والتصدير
                                </span>
                                <ChevronDown size={14} className={`transition-transform duration-300 ${Object.values(isReportsOpen).some(Boolean) ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Grouped Sub-items */}
                            <div className={`overflow-hidden transition-all duration-300 ${Object.values(isReportsOpen).some(Boolean) ? 'max-h-[600px] mt-1' : 'max-h-0'}`}>
                                <div className="space-y-2 pr-4">
                                    {reportGroups.map(group => {
                                        const GroupIcon = group.icon;
                                        const groupOpen = isReportsOpen[group.id];
                                        const hasActiveChild = group.children.some(c => location.pathname === c.href);
                                        return (
                                            <div key={group.id}>
                                                <button
                                                    onClick={() => toggleReportGroup(group.id)}
                                                    className={`
                                                        w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-200
                                                        ${hasActiveChild || groupOpen
                                                            ? 'text-cyan-300' 
                                                            : 'text-white/40 hover:text-white/70'}
                                                    `}
                                                >
                                                    <GroupIcon size={12} strokeWidth={2} className="shrink-0" />
                                                    <span className="text-[9px] font-black uppercase tracking-wider whitespace-nowrap flex-1 text-right">
                                                        {group.name}
                                                    </span>
                                                    <ChevronDown size={10} className={`transition-transform duration-200 ${groupOpen ? 'rotate-180' : ''}`} />
                                                </button>
                                                <div className={`overflow-hidden transition-all duration-200 ${groupOpen ? 'max-h-60 mt-0.5' : 'max-h-0'}`}>
                                                    <div className="space-y-0.5 pr-3">
                                                        {group.children.map(child => {
                                                            const ChildIcon = child.icon;
                                                            const isActive = location.pathname === child.href;
                                                            return (
                                                                <Link
                                                                    key={child.id}
                                                                    to={child.href}
                                                                    onClick={() => setIsSidebarOpen(false)}
                                                                    className={`
                                                                        flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200
                                                                        ${isActive 
                                                                            ? 'bg-cyan-400/20 text-cyan-300' 
                                                                            : 'text-white/30 hover:bg-white/10 hover:text-white/60'}
                                                                    `}
                                                                >
                                                                    <ChildIcon size={12} strokeWidth={2} className="shrink-0" />
                                                                    <span className="text-[9px] font-bold whitespace-nowrap">
                                                                        {child.name}
                                                                    </span>
                                                                </Link>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </nav>

                    {/* Profile / Logout Section */}
                    <div className="border-t border-white/10 p-3 relative">
                        <button
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-all"
                        >
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white font-black text-xs shrink-0">
                                {user?.displayName?.charAt(0) || 'A'}
                            </div>
                            <div className="text-right flex-1 min-w-0">
                                <p className="text-[11px] font-black text-white truncate">{user?.displayName || 'Admin'}</p>
                                <p className="text-[9px] font-bold text-white/40 uppercase truncate">{user?.role || ''}</p>
                            </div>
                            <ChevronDown size={14} className={`text-white/40 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isProfileOpen && (
                            <div className="absolute bottom-full left-3 right-3 mb-2 bg-[#0A2472] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                                <div className="p-2">
                                    <button
                                        onClick={() => { logout(); navigate('/login'); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-all"
                                    >
                                        <LogOut size={14} />
                                        <span className="text-[10px] font-black uppercase tracking-wider">تسجيل الخروج</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 lg:mr-20 transition-all duration-500 overflow-y-auto h-screen" style={{ zoom: `${zoomLevel}%` }}>
                {/* Top Bar */}
                <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-border/50 px-4 lg:px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
                        >
                            <Menu size={18} />
                        </button>
                        <h2 className="text-sm font-black text-foreground uppercase tracking-widest">{pageTitle}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleZoomOut} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                            <ZoomOut size={14} />
                        </button>
                        <span className="text-[10px] font-black text-muted-foreground w-10 text-center">{zoomLevel}%</span>
                        <button onClick={handleZoomIn} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                            <ZoomIn size={14} />
                        </button>
                    </div>
                </div>

                {/* Page Content */}
                <div className="p-4 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
