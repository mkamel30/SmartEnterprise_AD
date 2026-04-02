import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    Package, Download, Warehouse
} from 'lucide-react';
import adminClient from '../api/adminClient';
import toast from 'react-hot-toast';

export default function InventoryOverview() {
    const [filters, setFilters] = useState({
        branchId: '',
        search: ''
    });

    const { data, isLoading } = useQuery({
        queryKey: ['inventory-all', filters],
        queryFn: () => {
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            return adminClient.get(`/inventory/all?${params}`).then(r => r.data);
        }
    });

    const { data: branches } = useQuery({
        queryKey: ['branches-list'],
        queryFn: () => adminClient.get('/branches').then(r => r.data)
    });

    const handleExport = async () => {
        try {
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            
            const response = await adminClient.get(`/inventory/export?${params}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `inventory_${new Date().toISOString().slice(0,10)}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('تم تصدير البيانات بنجاح');
        } catch (error) {
            toast.error('فشل في تصدير البيانات');
        }
    };

    const inventory = data?.data || [];
    const filteredInventory = filters.search 
        ? inventory.filter((i: any) => 
            i.partName?.toLowerCase().includes(filters.search.toLowerCase()) ||
            i.partNumber?.toLowerCase().includes(filters.search.toLowerCase()) ||
            i.branchName?.toLowerCase().includes(filters.search.toLowerCase())
          )
        : inventory;

    const totalQuantity = filteredInventory.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);

    // Group by branch for summary
    const branchSummary = filteredInventory.reduce((acc: any, i: any) => {
        if (!acc[i.branchId]) {
            acc[i.branchId] = { name: i.branchName, parts: 0, quantity: 0 };
        }
        acc[i.branchId].parts++;
        acc[i.branchId].quantity += i.quantity || 0;
        return acc;
    }, {});

    return (
        <div className="space-y-6" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl lg:text-2xl font-black text-primary uppercase flex items-center gap-3">
                        <Warehouse className="text-brand-cyan" size={24} />
                        جرد المخزون
                    </h1>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">
                        المخزون الحالي لجميع الفروع
                    </p>
                </div>
                <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-black text-sm hover:shadow-md">
                    <Download size={16} /> تصدير Excel
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-4 border-2 border-primary/10 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Package className="text-primary" size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase">إجمالي القطع</p>
                            <p className="text-xl font-black text-primary">{filteredInventory.length}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-4 border-2 border-primary/10 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                            <Package className="text-green-600" size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase">إجمالي الكمية</p>
                            <p className="text-xl font-black text-green-600">{totalQuantity}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-4 border-2 border-primary/10 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                            <Warehouse className="text-amber-600" size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase">الفروع</p>
                            <p className="text-xl font-black text-amber-600">{Object.keys(branchSummary).length}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Branch Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.values(branchSummary).map((b: any, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <div className="font-black text-primary">{b.name}</div>
                        <div className="text-sm text-slate-500 mt-1">
                            <span>{b.parts} قطع</span> • <span>{b.quantity} وحدة</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 border-2 border-primary/10 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <select 
                        className="smart-select"
                        value={filters.branchId}
                        onChange={(e) => setFilters(f => ({ ...f, branchId: e.target.value }))}
                    >
                        <option value="">كل الفروع</option>
                        {branches?.map((b: any) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                    <input 
                        type="text" 
                        className="smart-input md:col-span-2"
                        placeholder="بحث..."
                        value={filters.search}
                        onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الفرع</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">اسم القطعة</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">رقم القطعة</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">التكلفة</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الكمية</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الموقع</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold">جاري التحميل...</td></tr>
                            ) : filteredInventory.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold">لا توجد بيانات</td></tr>
                            ) : (
                                filteredInventory.map((i: any) => (
                                    <tr key={i.id} className="hover:bg-slate-50">
                                        <td className="p-3 text-sm font-bold text-primary">{i.branchName}</td>
                                        <td className="p-3 text-sm font-bold">{i.partName}</td>
                                        <td className="p-3 text-sm font-mono text-slate-500">{i.partNumber}</td>
                                        <td className="p-3 text-sm font-black text-green-600">{i.defaultCost?.toLocaleString()}</td>
                                        <td className="p-3 text-lg font-black">{i.quantity}</td>
                                        <td className="p-3 text-sm text-slate-500">{i.location}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}