import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    TrendingUp
} from 'lucide-react';
import adminClient from '../api/adminClient';

export default function PriceHistoryPage() {
    const [filters, setFilters] = useState({
        partId: '',
        search: ''
    });

    const { data: parts } = useQuery({
        queryKey: ['spare-parts-list'],
        queryFn: () => adminClient.get('/spare-parts').then(r => r.data)
    });

    const { data: priceLogs, isLoading } = useQuery({
        queryKey: ['price-logs', filters.partId],
        queryFn: () => {
            if (!filters.partId) return Promise.resolve({ data: [] });
            return adminClient.get(`/spare-parts/${filters.partId}/price-logs`).then(r => r.data);
        },
        enabled: !!filters.partId
    });

    const logs = Array.isArray(priceLogs) ? priceLogs : [];

    return (
        <div className="space-y-6" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl lg:text-2xl font-black text-primary uppercase flex items-center gap-3">
                        <TrendingUp className="text-brand-cyan" size={24} />
                        سجل أسعار القطع
                    </h1>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">
                        تغييرات أسعار قطع الغيار عبر الوقت
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 border-2 border-primary/10 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <select 
                        className="smart-select"
                        value={filters.partId}
                        onChange={(e) => setFilters(f => ({ ...f, partId: e.target.value }))}
                    >
                        <option value="">اختر قطعة غيار</option>
                        {parts?.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name} - {p.partNumber}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Price Logs Table */}
            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                    <h3 className="font-black text-primary">سجل التغييرات</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">التاريخ</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">السعر القديم</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">السعر الجديد</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">التغيير</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">بواسطة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {!filters.partId ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold">اختر قطعة غيار أولاً</td></tr>
                            ) : isLoading ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold">جاري التحميل...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold">لا توجد سجلات</td></tr>
                            ) : (
                                logs.map((log: any) => {
                                    const change = log.newCost - log.oldCost;
                                    const isIncrease = change > 0;
                                    return (
                                        <tr key={log.id} className="hover:bg-slate-50">
                                            <td className="p-3 text-sm font-bold">
                                                {new Date(log.changedAt).toLocaleString('ar-EG')}
                                            </td>
                                            <td className="p-3 text-sm font-black text-slate-500">{log.oldCost}</td>
                                            <td className="p-3 text-sm font-black text-primary">{log.newCost}</td>
                                            <td className="p-3">
                                                <span className={`font-black text-sm ${isIncrease ? 'text-red-600' : 'text-green-600'}`}>
                                                    {isIncrease ? '+' : ''}{change.toFixed(2)} ج.م
                                                </span>
                                            </td>
                                            <td className="p-3 text-sm text-slate-500">{log.changedBy || '-'}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}