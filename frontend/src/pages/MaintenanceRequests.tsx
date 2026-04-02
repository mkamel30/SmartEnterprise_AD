import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    Wrench, Download
} from 'lucide-react';
import adminClient from '../api/adminClient';
import toast from 'react-hot-toast';

const statusMap: any = {
    'NEW': { label: 'جديد', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    'ASSIGNED': { label: 'محدد له فني', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    'IN_PROGRESS': { label: 'قيد الصيانة', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    'PENDING_APPROVAL': { label: 'في انتظار الموافقة', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    'PENDING_PARTS': { label: 'في انتظار قطع الغيار', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    'CLOSED': { label: 'مغلق', color: 'bg-green-50 text-green-700 border-green-200' },
    'CANCELLED': { label: 'ملغى', color: 'bg-slate-100 text-slate-500 border-slate-200' }
};

export default function MaintenanceRequestsPage() {
    const [filters, setFilters] = useState({
        branchId: '',
        status: 'ALL',
        startDate: '',
        endDate: '',
        search: ''
    });

    const { data, isLoading } = useQuery({
        queryKey: ['maintenance-requests', filters],
        queryFn: () => {
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            if (filters.status !== 'ALL') params.append('status', filters.status);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            return adminClient.get(`/maintenance-requests?${params}`).then(r => r.data);
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
            if (filters.status !== 'ALL') params.append('status', filters.status);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            
            const response = await adminClient.get(`/maintenance-requests/export?${params}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `maintenance_requests_${new Date().toISOString().slice(0,10)}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('تم تصدير البيانات بنجاح');
        } catch (error) {
            toast.error('فشل في تصدير البيانات');
        }
    };

    const requests = data?.data || [];
    const filteredRequests = filters.search 
        ? requests.filter((r: any) => 
            r.customerName?.toLowerCase().includes(filters.search.toLowerCase()) ||
            r.machineSerial?.toLowerCase().includes(filters.search.toLowerCase()) ||
            r.branchName?.toLowerCase().includes(filters.search.toLowerCase())
          )
        : requests;

    return (
        <div className="space-y-6" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl lg:text-2xl font-black text-primary uppercase flex items-center gap-3">
                        <Wrench className="text-brand-cyan" size={24} />
                        طلبات الصيانة
                    </h1>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">
                        متابعة طلبات الصيانة لجميع الفروع
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
                    <select 
                        className="smart-select"
                        value={filters.status}
                        onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
                    >
                        <option value="ALL">كل الحالات</option>
                        {Object.entries(statusMap).map(([key, v]: any) => (
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
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الماكينة</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الحالة</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">التكلفة</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الفني</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold">جاري التحميل...</td></tr>
                            ) : filteredRequests.length === 0 ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold">لا توجد بيانات</td></tr>
                            ) : (
                                filteredRequests.map((r: any) => (
                                    <tr key={r.id} className="hover:bg-slate-50">
                                        <td className="p-3 text-sm font-bold">{new Date(r.date).toLocaleDateString('ar-EG')}</td>
                                        <td className="p-3 text-sm font-bold text-primary">{r.branchName}</td>
                                        <td className="p-3 text-sm">
                                            <div className="font-bold">{r.customerName}</div>
                                            <div className="text-[10px] text-slate-400">{r.customerCode}</div>
                                        </td>
                                        <td className="p-3 text-sm">
                                            <div className="font-mono text-xs">{r.machineSerial}</div>
                                            <div className="text-[10px] text-slate-400">{r.machineModel}</div>
                                        </td>
                                        <td className="p-3">
                                            <span className={`inline-flex px-2 py-1 rounded-full font-black text-[10px] border ${statusMap[r.status]?.color || 'bg-slate-100'}`}>
                                                {statusMap[r.status]?.label || r.status}
                                            </span>
                                        </td>
                                        <td className="p-3 text-lg font-black text-green-600">{r.totalCost?.toLocaleString() || 0}</td>
                                        <td className="p-3 text-sm text-slate-500">{r.technicianName}</td>
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