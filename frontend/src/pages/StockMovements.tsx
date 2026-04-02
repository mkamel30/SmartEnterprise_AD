import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    RefreshCw, Download, 
    ArrowDownCircle, ArrowUpCircle
} from 'lucide-react';
import adminClient from '../api/adminClient';
import toast from 'react-hot-toast';

export default function StockMovements() {
    const [filters, setFilters] = useState({
        branchId: '',
        startDate: '',
        endDate: '',
        type: 'ALL',
        search: ''
    });

    const { data, isLoading } = useQuery({
        queryKey: ['stock-movements', filters],
        queryFn: () => {
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            if (filters.type !== 'ALL') params.append('type', filters.type);
            return adminClient.get(`/stock-movements?${params}`).then(r => r.data);
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
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            if (filters.type !== 'ALL') params.append('type', filters.type);
            
            const response = await adminClient.get(`/stock-movements/export?${params}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `stock_movements_${new Date().toISOString().slice(0,10)}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('تم تصدير البيانات بنجاح');
        } catch (error) {
            toast.error('فشل في تصدير البيانات');
        }
    };

    const movements = data?.data || [];
    const filteredMovements = filters.search 
        ? movements.filter((m: any) => 
            m.partName?.toLowerCase().includes(filters.search.toLowerCase()) ||
            m.branchName?.toLowerCase().includes(filters.search.toLowerCase()) ||
            m.customerName?.toLowerCase().includes(filters.search.toLowerCase())
          )
        : movements;

    return (
        <div className="space-y-6" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl lg:text-2xl font-black text-primary uppercase flex items-center gap-3">
                        <RefreshCw className="text-brand-cyan" size={24} />
                        حركات المخزون
                    </h1>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">
                        تسجيل حركة خروج و دخول قطع الغيار عبر الفروع
                    </p>
                </div>
                <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-black text-sm hover:shadow-md">
                    <Download size={16} /> تصدير Excel
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 border-2 border-primary/10 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                        type="date" 
                        className="smart-input"
                        value={filters.startDate}
                        onChange={(e) => setFilters(f => ({ ...f, startDate: e.target.value }))}
                    />
                    <input 
                        type="date" 
                        className="smart-input"
                        value={filters.endDate}
                        onChange={(e) => setFilters(f => ({ ...f, endDate: e.target.value }))}
                    />
                    <select 
                        className="smart-select"
                        value={filters.type}
                        onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}
                    >
                        <option value="ALL">كل الأنواع</option>
                        <option value="IN">دخول</option>
                        <option value="OUT">خروج</option>
                    </select>
                    <input 
                        type="text" 
                        className="smart-input"
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
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">التاريخ</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الفرع</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">اسم القطعة</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">النوع</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الكمية</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">السبب</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">العميل</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">بواسطة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-bold">جاري التحميل...</td></tr>
                            ) : filteredMovements.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-bold">لا توجد بيانات</td></tr>
                            ) : (
                                filteredMovements.map((m: any) => (
                                    <tr key={m.id} className="hover:bg-slate-50">
                                        <td className="p-3 text-sm font-bold">{new Date(m.date).toLocaleDateString('ar-EG')}</td>
                                        <td className="p-3 text-sm font-bold text-primary">{m.branchName}</td>
                                        <td className="p-3 text-sm">
                                            <div className="font-bold">{m.partName}</div>
                                            <div className="text-[10px] text-slate-400 font-mono">{m.partNumber}</div>
                                        </td>
                                        <td className="p-3">
                                            {m.type === 'IN' ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-700 font-black text-[10px] border border-green-200">
                                                    <ArrowDownCircle size={12} /> دخول
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-700 font-black text-[10px] border border-red-200">
                                                    <ArrowUpCircle size={12} /> خروج
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3 text-lg font-black">{m.quantity}</td>
                                        <td className="p-3 text-sm font-bold text-slate-500">{m.reason}</td>
                                        <td className="p-3 text-sm">
                                            {m.customerName ? (
                                                <div>{m.customerName}</div>
                                            ) : '-'}
                                        </td>
                                        <td className="p-3 text-sm text-slate-500">{m.performedBy}</td>
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