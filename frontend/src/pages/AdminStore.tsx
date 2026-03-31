import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    Package, 
    Plus, 
    ArrowRightLeft, 
    Search,
    Filter,
    MoreHorizontal,
    Box,
    Building
} from 'lucide-react';
import adminClient from '../api/adminClient';

const API_BASE = '/admin-store';

export default function AdminStore() {
    const [view, setView] = useState<'inventory' | 'cartons' | 'transfers' | 'history'>('inventory');
    const [searchTerm, setSearchTerm] = useState('');

    // Fetch Inventory
    const { data: assets, isLoading: assetsLoading } = useQuery({
        queryKey: ['admin-assets'],
        queryFn: async () => {
            const res = await adminClient.get(`${API_BASE}/inventory`);
            return res.data;
        }
    });

    // Fetch Stocks by Branch
    useQuery({
        queryKey: ['admin-stocks'],
        queryFn: async () => {
            const res = await adminClient.get(`${API_BASE}/stocks`);
            return res.data;
        }
    });

    return (
        <div className="space-y-6 animate-fade-in" dir="rtl">
            {/* Header section with Stats */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-foreground">المخازن الإدارية</h1>
                    <p className="text-muted-foreground font-bold mt-1">إدارة الأصول، العهد، وتوزيعها على الفروع</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="smart-btn-primary flex items-center gap-2">
                        <Plus size={18} />
                        <span>إضافة عهدة جديدة</span>
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="إجمالي الأصول" value={assets?.length || 0} icon={<Package className="text-primary" />} />
                <StatCard title="أصول متاحة" value={assets?.filter((a:any) => a.status === 'AVAILABLE').length || 0} icon={<Box className="text-success" />} />
                <StatCard title="بانتظار التحويل" value={assets?.filter((a:any) => a.status === 'PENDING').length || 0} icon={<ArrowRightLeft className="text-warning" />} />
                <StatCard title="موزع بالفروع" value={assets?.filter((a:any) => a.status === 'TRANSFERRED').length || 0} icon={<Building className="text-primary" />} />
            </div>

            {/* Main Tabs */}
            <div className="bg-card rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <div className="flex border-b border-border bg-muted/30 p-2 gap-2">
                    <button 
                        onClick={() => setView('inventory')}
                        className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${view === 'inventory' ? 'bg-primary text-white shadow-md' : 'text-muted-foreground hover:bg-muted font-bold'}`}
                    >
                        المخزون العام
                    </button>
                    <button 
                        onClick={() => setView('cartons')}
                        className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${view === 'cartons' ? 'bg-primary text-white shadow-md' : 'text-muted-foreground hover:bg-muted font-bold'}`}
                    >
                        الكراتين والمجموعات
                    </button>
                    <button 
                        onClick={() => setView('transfers')}
                        className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${view === 'transfers' ? 'bg-primary text-white shadow-md' : 'text-muted-foreground hover:bg-muted font-bold'}`}
                    >
                        التحويلات للفروع
                    </button>
                    <button 
                        onClick={() => setView('history')}
                        className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${view === 'history' ? 'bg-primary text-white shadow-md' : 'text-muted-foreground hover:bg-muted font-bold'}`}
                    >
                        سجل الحركات
                    </button>
                </div>

                <div className="p-6">
                    {/* Search & Filter Bar */}
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                            <input 
                                type="text"
                                placeholder="ابحث بالسيريال، النوع، أو الملاحظات..."
                                className="smart-input pl-4 pr-10 py-2.5"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button className="smart-btn-secondary flex items-center justify-center gap-2">
                            <Filter size={18} />
                            <span>تصفية متقدمة</span>
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="table-container custom-scrollbar">
                        <table className="min-w-full">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="px-6 py-4 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">نوع العهدة</th>
                                    <th className="px-6 py-4 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">السيريال نمبر</th>
                                    <th className="px-6 py-4 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">الحالة</th>
                                    <th className="px-6 py-4 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">المكان الحالي</th>
                                    <th className="px-6 py-4 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">ملاحظات</th>
                                    <th className="px-6 py-4 text-center text-xs font-black text-muted-foreground uppercase tracking-widest">إجراءات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {assetsLoading ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground font-bold">جاري تحميل البيانات...</td>
                                    </tr>
                                ) : assets?.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground font-bold">لا توجد أصول مسجلة حالياً</td>
                                    </tr>
                                ) : (
                                    assets?.filter((a:any) => 
                                        a.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        a.itemType.name.toLowerCase().includes(searchTerm.toLowerCase())
                                    ).map((asset: any) => (
                                        <tr key={asset.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="font-black text-[#0A2472]">{asset.itemType.name}</div>
                                                <div className="text-[10px] text-muted-foreground">Code: {asset.itemTypeCode}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap font-mono text-sm font-bold">{asset.serialNumber}</td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`smart-badge ${
                                                    asset.status === 'AVAILABLE' ? 'smart-badge-success' :
                                                    asset.status === 'TRANSFERRED' ? 'smart-badge-primary' :
                                                    'smart-badge-warning'
                                                }`}>
                                                    {asset.status === 'AVAILABLE' ? 'متاح بالمخزن' : 
                                                     asset.status === 'TRANSFERRED' ? 'منصف للفروع' : asset.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold">
                                                {asset.status === 'AVAILABLE' ? 'المخزن الإداري' : asset.currentBranchId || '---'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-muted-foreground">{asset.notes || '---'}</td>
                                            <td className="px-6 py-4 text-center">
                                                <button className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-primary">
                                                    <MoreHorizontal size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon }: any) {
    return (
        <div className="bg-card p-5 rounded-2xl border-2 border-primary/5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-muted/50 rounded-xl">{icon}</div>
                <span className="text-2xl font-black">{value}</span>
            </div>
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">{title}</p>
        </div>
    );
}
