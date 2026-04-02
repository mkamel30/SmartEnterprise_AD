import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    DollarSign, Download, CreditCard
} from 'lucide-react';
import adminClient from '../api/adminClient';
import toast from 'react-hot-toast';

const typeMap: any = {
    'INSTALLMENT': { label: 'قسط', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    'MAINTENANCE': { label: 'صيانة', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    'SALE': { label: 'بيع', color: 'bg-green-50 text-green-700 border-green-200' },
    'EXCHANGE': { label: 'استبدال', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    'REFUND': { label: 'استرجاع', color: 'bg-red-50 text-red-700 border-red-200' },
    'OTHER': { label: 'أخرى', color: 'bg-slate-100 text-slate-500 border-slate-200' }
};

export default function PaymentsPage() {
    const [filters, setFilters] = useState({
        branchId: '',
        type: 'ALL',
        startDate: '',
        endDate: '',
        search: ''
    });

    const { data, isLoading } = useQuery({
        queryKey: ['payments', filters],
        queryFn: () => {
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            if (filters.type !== 'ALL') params.append('type', filters.type);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            return adminClient.get(`/payments?${params}`).then(r => r.data);
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
            if (filters.type !== 'ALL') params.append('type', filters.type);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            
            const response = await adminClient.get(`/payments/export?${params}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `payments_${new Date().toISOString().slice(0,10)}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('تم تصدير البيانات بنجاح');
        } catch (error) {
            toast.error('فشل في تصدير البيانات');
        }
    };

    const payments = data?.data || [];
    const filteredPayments = filters.search 
        ? payments.filter((p: any) => 
            p.customerName?.toLowerCase().includes(filters.search.toLowerCase()) ||
            p.receiptNumber?.toLowerCase().includes(filters.search.toLowerCase()) ||
            p.branchName?.toLowerCase().includes(filters.search.toLowerCase())
          )
        : payments;

    const totalAmount = filteredPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    return (
        <div className="space-y-6" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl lg:text-2xl font-black text-primary uppercase flex items-center gap-3">
                        <DollarSign className="text-brand-cyan" size={24} />
                        المدفوعات
                    </h1>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">
                        سجل المدفوعات عبر جميع الفروع
                    </p>
                </div>
                <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-black text-sm hover:shadow-md">
                    <Download size={16} /> تصدير Excel
                </button>
            </div>

            {/* Summary */}
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-white/60 font-bold text-sm">إجمالي المدفوعات</p>
                        <p className="text-3xl font-black mt-1">{totalAmount.toLocaleString()} ج.م</p>
                    </div>
                    <CreditCard size={48} className="text-white/30" />
                </div>
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
                    <select 
                        className="smart-select"
                        value={filters.type}
                        onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}
                    >
                        <option value="ALL">كل الأنواع</option>
                        {Object.entries(typeMap).map(([key, v]: any) => (
                            <option key={key} value={key}>{v.label}</option>
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
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">العميل</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">النوع</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">المبلغ</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">السبب</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">رقم الإيصال</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold">جاري التحميل...</td></tr>
                            ) : filteredPayments.length === 0 ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold">لا توجد بيانات</td></tr>
                            ) : (
                                filteredPayments.map((p: any) => (
                                    <tr key={p.id} className="hover:bg-slate-50">
                                        <td className="p-3 text-sm font-bold">{new Date(p.date).toLocaleDateString('ar-EG')}</td>
                                        <td className="p-3 text-sm font-bold text-primary">{p.branchName}</td>
                                        <td className="p-3 text-sm">
                                            <div className="font-bold">{p.customerName}</div>
                                            <div className="text-[10px] text-slate-400">{p.customerCode}</div>
                                        </td>
                                        <td className="p-3">
                                            <span className={`inline-flex px-2 py-1 rounded-full font-black text-[10px] border ${typeMap[p.type]?.color || 'bg-slate-100'}`}>
                                                {typeMap[p.type]?.label || p.type}
                                            </span>
                                        </td>
                                        <td className="p-3 text-lg font-black text-green-600">{p.amount?.toLocaleString()}</td>
                                        <td className="p-3 text-sm text-slate-500">{p.reason || '-'}</td>
                                        <td className="p-3 text-sm font-mono text-slate-400">{p.receiptNumber || '-'}</td>
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