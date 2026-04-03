import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import {
    LayoutDashboard, Building2, Users,
    RefreshCw, Settings2, LogOut, RotateCcw,
    Menu, ChevronDown, ZoomIn, ZoomOut,
    TrendingUp, Github, Key, Wrench, DollarSign, Warehouse, Package, Calendar,
    BarChart3
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
            { id: 'price-history', name: 'سعر القطع', href: '/reports/price-history', icon: TrendingUp },
        ]
    },
];

const utilityItems: NavItem[] = [
    { id: 'software-updates', name: 'التحديثات', href: '/software-updates', icon: Github },
    { id: 'license-manager', name: 'التراخيص', href: '/license-manager', icon: Key },
    { id: 'sync-status', name: 'المزامنة', href: '/sync-status', icon: RefreshCw },
    { id: 'version-logs', name: 'الإصدارات', href: '/version-logs', icon: RotateCcw },
    { id: 'settings', name: 'الإعدادات', href: '/settings', icon: Settings2 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [zoomLevel, setZoomLevel] = useState(100);

    const toggleGroup = (id: string) => {
        setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const isActive = (href: string) => {
        if (href === '/') return location.pathname === '/';
        return location.pathname === href || location.pathname.startsWith(href + '/');
    };

    const isAnyReportActive = reportGroups.some(g => g.children.some(c => isActive(c.href)));
    const isAnyGroupExpanded = Object.values(expandedGroups).some(Boolean);

    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 5, 150));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 5, 70));

    return (
        <div className="flex bg-[#f8fafc] text-[#0f172a] overflow-hidden h-screen" dir="rtl">
            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm transition-opacity lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed top-0 bottom-0 right-0 z-50 h-full
                transition-all duration-300 ease-in-out
                bg-white border-l border-slate-200 shadow-xl
                group peer
                ${isSidebarOpen ? 'translate-x-0 w-64' : 'translate-x-full w-64'}
                lg:translate-x-0 lg:w-[68px] lg:hover:w-64
            `}>
                <div className="h-full flex flex-col overflow-hidden">
                    {/* Logo */}
                    <div className="h-[64px] flex items-center px-4 border-b border-slate-100">
                        <div className="flex items-center gap-3 w-full">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0A2472] to-[#0E6BA8] flex items-center justify-center shrink-0 shadow-md">
                                <img src="/logo.png" alt="" className="w-6 h-6 object-contain brightness-0 invert" />
                            </div>
                            <div className="overflow-hidden whitespace-nowrap opacity-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
                                <h1 className="text-xs font-black text-[#0A2472] uppercase tracking-wider">Smart Enterprise</h1>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Admin Portal</p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-thin">
                        {/* Main Items */}
                        {navItems.map(item => {
                            const Icon = item.icon;
                            const active = isActive(item.href);
                            return (
                                <Link
                                    key={item.id}
                                    to={item.href}
                                    onClick={() => setIsSidebarOpen(false)}
                                    className={`
                                        flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group/item
                                        ${active 
                                            ? 'bg-[#0A2472] text-white shadow-md shadow-[#0A2472]/20' 
                                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}
                                    `}
                                >
                                    <Icon size={18} strokeWidth={active ? 2.5 : 1.8} className="shrink-0" />
                                    <span className="text-[11px] font-bold whitespace-nowrap overflow-hidden opacity-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
                                        {item.name}
                                    </span>
                                </Link>
                            );
                        })}

                        {/* Reports Section */}
                        <div className="pt-3 pb-1">
                            <button
                                onClick={() => {
                                    const allOpen = reportGroups.every(g => expandedGroups[g.id]);
                                    const newState = !allOpen;
                                    const newStateMap: Record<string, boolean> = {};
                                    reportGroups.forEach(g => { newStateMap[g.id] = newState; });
                                    setExpandedGroups(newStateMap);
                                }}
                                className={`
                                    w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200
                                    ${(isAnyReportActive || isAnyGroupExpanded)
                                        ? 'bg-slate-100 text-slate-900' 
                                        : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}
                                `}
                            >
                                <TrendingUp size={18} strokeWidth={1.8} className="shrink-0" />
                                <span className="text-[11px] font-bold whitespace-nowrap overflow-hidden opacity-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 flex-1 text-right">
                                    التقارير
                                </span>
                                <ChevronDown size={12} className={`shrink-0 opacity-0 lg:opacity-0 lg:group-hover:opacity-100 transition-all duration-200 ${isAnyGroupExpanded ? 'rotate-180' : ''}`} />
                            </button>
                        </div>

                        {/* Report Sub-Groups */}
                        <div className={`overflow-hidden transition-all duration-300 ${isAnyGroupExpanded ? 'max-h-[500px]' : 'max-h-0'}`}>
                            <div className="space-y-1 pr-2">
                                {reportGroups.map(group => {
                                    const GroupIcon = group.icon;
                                    const groupOpen = expandedGroups[group.id];
                                    const hasActiveChild = group.children.some(c => isActive(c.href));
                                    return (
                                        <div key={group.id}>
                                            <button
                                                onClick={() => toggleGroup(group.id)}
                                                className={`
                                                    w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200
                                                    ${hasActiveChild || groupOpen
                                                        ? 'text-[#0A2472] bg-[#0A2472]/5' 
                                                        : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}
                                                `}
                                            >
                                                <GroupIcon size={14} strokeWidth={1.8} className="shrink-0" />
                                                <span className="text-[10px] font-black uppercase tracking-wider whitespace-nowrap overflow-hidden opacity-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 flex-1 text-right">
                                                    {group.name}
                                                </span>
                                                <ChevronDown size={10} className={`shrink-0 opacity-0 lg:opacity-0 lg:group-hover:opacity-100 transition-transform duration-200 ${groupOpen ? 'rotate-180' : ''}`} />
                                            </button>
                                            <div className={`overflow-hidden transition-all duration-200 ${groupOpen ? 'max-h-60 mt-0.5' : 'max-h-0'}`}>
                                                <div className="space-y-0.5 pr-3">
                                                    {group.children.map(child => {
                                                        const ChildIcon = child.icon;
                                                        const childActive = isActive(child.href);
                                                        return (
                                                            <Link
                                                                key={child.id}
                                                                to={child.href}
                                                                onClick={() => setIsSidebarOpen(false)}
                                                                className={`
                                                                    flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200
                                                                    ${childActive 
                                                                        ? 'bg-[#0A2472] text-white' 
                                                                        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}
                                                                `}
                                                            >
                                                                <ChildIcon size={12} strokeWidth={1.8} className="shrink-0" />
                                                                <span className="text-[10px] font-bold whitespace-nowrap overflow-hidden opacity-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
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

                        {/* Divider */}
                        <div className="border-t border-slate-100 my-2" />

                        {/* Utility Items */}
                        {utilityItems.map(item => {
                            const Icon = item.icon;
                            const active = isActive(item.href);
                            return (
                                <Link
                                    key={item.id}
                                    to={item.href}
                                    onClick={() => setIsSidebarOpen(false)}
                                    className={`
                                        flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
                                        ${active 
                                            ? 'bg-[#0A2472] text-white shadow-md shadow-[#0A2472]/20' 
                                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}
                                    `}
                                >
                                    <Icon size={18} strokeWidth={active ? 2.5 : 1.8} className="shrink-0" />
                                    <span className="text-[11px] font-bold whitespace-nowrap overflow-hidden opacity-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
                                        {item.name}
                                    </span>
                                </Link>
                            );
                        })}
                    </nav>

                    {/* User Profile */}
                    <div className="border-t border-slate-100 p-2 relative">
                        <button
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 transition-all"
                        >
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0A2472] to-[#0E6BA8] flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm">
                                {user?.displayName?.charAt(0) || 'A'}
                            </div>
                            <div className="text-right flex-1 min-w-0 overflow-hidden opacity-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
                                <p className="text-[11px] font-black text-slate-800 truncate">{user?.displayName || 'Admin'}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase truncate">{user?.role || ''}</p>
                            </div>
                            <ChevronDown size={14} className={`text-slate-400 opacity-0 lg:opacity-0 lg:group-hover:opacity-100 transition-transform duration-200 ${isProfileOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isProfileOpen && (
                            <div className="absolute bottom-full left-2 right-2 mb-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50">
                                <button
                                    onClick={() => { logout(); navigate('/login'); }}
                                    className="w-full flex items-center gap-2 px-4 py-3 text-red-600 hover:bg-red-50 transition-all"
                                >
                                    <LogOut size={14} />
                                    <span className="text-[11px] font-bold">تسجيل الخروج</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 lg:mr-[68px] transition-all duration-300 overflow-y-auto h-screen">
                {/* Top Bar */}
                <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200 px-4 lg:px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
                        >
                            <Menu size={18} />
                        </button>
                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                            {navItems.find(n => isActive(n.href))?.name || 
                             utilityItems.find(n => isActive(n.href))?.name ||
                             'التقارير'}
                        </h2>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={handleZoomOut} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
                            <ZoomOut size={14} />
                        </button>
                        <span className="text-[10px] font-black text-slate-400 w-10 text-center">{zoomLevel}%</span>
                        <button onClick={handleZoomIn} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
                            <ZoomIn size={14} />
                        </button>
                    </div>
                </div>

                {/* Page Content */}
                <div className="p-4 lg:p-8" style={{ zoom: `${zoomLevel}%` }}>
                    {children}
                </div>
            </main>
        </div>
    );
}
