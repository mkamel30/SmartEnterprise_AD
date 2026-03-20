import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { api } from '../api/client';
import toast from 'react-hot-toast';

export default function SyncStatus() {
    const [queues, setQueues] = useState<any[]>([]);
    const [summary, setSummary] = useState({ total: 0, pending: 0, synced: 0, error: 0 });
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ALL');

    const fetchSyncQueue = async () => {
        try {
            setLoading(true);
            const statusParams = filter !== 'ALL' ? `?status=${filter}` : '';
            const response = (await api.get(`/sync-queue${statusParams}`)) as any;
            
            // Safe fallback if data is missing
            setQueues(response.data?.data || []);
            setSummary(response.data?.summary || { total: 0, pending: 0, synced: 0, error: 0 });
            
        } catch (error) {
            console.error('Sync fetch error:', error);
            toast.error('فشل في جلب بيانات طابور المزامنة');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSyncQueue();
        const interval = setInterval(fetchSyncQueue, 15000); 
        return () => clearInterval(interval);
    }, [filter]);

    const getStatusIcon = (status: string) => {
        if (status === 'SYNCED') return <CheckCircle2 className="text-success" size={18} />;
        if (status === 'PENDING') return <Clock className="text-warning animate-pulse" size={18} />;
        return <XCircle className="text-danger" size={18} />;
    };

    const getStatusText = (status: string) => {
        if (status === 'SYNCED') return 'مكتمل';
        if (status === 'PENDING') return 'قيد الانتظار';
        return 'خطأ';
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header Section */}
            <div className="flex justify-between items-center gap-4">
                <div>
                    <h1 className="text-xl lg:text-2xl font-black text-primary tracking-tight uppercase flex items-center gap-3">
                        <RefreshCw className="text-brand-cyan" size={24} />
                        محرك المزامنة اللحظية
                    </h1>
                    <p className="text-xs text-muted-foreground font-bold mt-1 tracking-widest uppercase">
                        مراقبة طابور التحديثات بين المركز الرئيسي والفروع
                    </p>
                </div>
                <div className="flex gap-3">
                    <button onClick={fetchSyncQueue} className="px-4 py-2 bg-white border-2 border-primary/10 text-primary rounded-lg font-black uppercase tracking-widest text-[10px] hover:bg-primary/5 transition-all disabled:opacity-50" disabled={loading}>
                        <RefreshCw size={14} className={`inline ml-1.5 ${loading ? 'animate-spin' : ''}`} />
                        تحديث
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'إجمالي العمليات', value: summary?.total || 0, color: 'text-primary', bg: 'bg-primary/5' },
                    { label: 'مكتمل بنجاح', value: summary?.synced || 0, color: 'text-success', bg: 'bg-success/10' },
                    { label: 'قيد الانتظار', value: summary?.pending || 0, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'عمليات فاشلة', value: summary?.error || 0, color: 'text-destructive', bg: 'bg-destructive/10' }
                ].map((stat, i) => (
                    <div key={i} className="bg-white p-4 rounded-2xl border-2 border-primary/10 shadow-sm transition-all hover:shadow-md">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{stat.label}</p>
                        <h3 className={`text-2xl font-black mt-1 ${stat.color}`}>{stat.value}</h3>
                    </div>
                ))}
            </div>

            {/* Main Log Table */}
            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border/50 flex justify-between items-center bg-muted/30">
                    <h2 className="font-black text-primary tracking-wide text-sm flex items-center gap-2">
                        <div className="w-1.5 h-4 bg-brand-cyan rounded-full"></div>
                        سجل طابور المزامنة
                    </h2>
                    <div className="flex gap-3">
                        <select 
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="bg-white border-2 border-border rounded-lg px-3 py-1.5 text-xs font-bold text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                        >
                            <option value="ALL">الكل</option>
                            <option value="SYNCED">المكتملة</option>
                            <option value="PENDING">قيد الانتظار</option>
                            <option value="ERROR">فاشلة</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                        <thead className="bg-muted/50 border-b-2 border-primary/10">
                            <tr>
                                <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">رقم العملية</th>
                                <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">الفرع</th>
                                <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">النوع</th>
                                <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">الإجراء</th>
                                <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">التاريخ</th>
                                <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {queues.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-10 text-center text-muted-foreground font-bold">
                                        لا توجد عمليات مزامنة حالياً
                                    </td>
                                </tr>
                            ) : (
                                queues.map((q) => (
                                    <tr key={q.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="p-4 font-mono text-xs text-muted-foreground">#{q.id.substring(q.id.length - 6).toUpperCase()}</td>
                                        <td className="p-4 font-black text-primary text-xs">{q.branch?.name || q.branchId}</td>
                                        <td className="p-4 font-bold text-muted-foreground/70 text-[10px] uppercase tracking-widest">{q.entityType}</td>
                                        <td className="p-4 font-bold text-muted-foreground/70 text-[10px] uppercase tracking-widest">{q.action}</td>
                                        <td className="p-4 text-xs text-muted-foreground/60 font-medium">
                                            {new Date(q.createdAt).toLocaleString('ar-EG')}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(q.status)}
                                                <span className={`text-[11px] font-black tracking-widest ${
                                                    q.status === 'SYNCED' ? 'text-success' : 
                                                    q.status === 'PENDING' ? 'text-amber-600' : 'text-destructive'
                                                }`}>
                                                    {getStatusText(q.status)}
                                                </span>
                                            </div>
                                        </td>
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
