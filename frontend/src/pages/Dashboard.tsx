import { useQuery } from '@tanstack/react-query';
import {
  Building2, Activity, Package, WifiOff,
  AlertTriangle, ChevronRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import adminClient from '../api/adminClient';

export default function Dashboard() {
    const navigate = useNavigate();

    const { data: branches } = useQuery({
        queryKey: ['dashboard-branches'],
        queryFn: () => adminClient.get('/branches').then(r => r.data),
    });

    const { data: spareParts } = useQuery({
        queryKey: ['dashboard-spare-parts'],
        queryFn: () => adminClient.get('/spare-parts').then(r => r.data),
    });

    const { data: syncLogs } = useQuery({
        queryKey: ['dashboard-sync-logs'],
        queryFn: () => adminClient.get('/sync/logs?limit=10').then(r => r.data),
    });

    const branchList = Array.isArray(branches) ? branches : [];
    const sparePartList = Array.isArray(spareParts) ? spareParts : [];
    const syncLogList = syncLogs?.data || [];

    const onlineBranches = branchList.filter(b => b.status === 'ONLINE');
    const offlineBranches = branchList.filter(b => b.status !== 'ONLINE');
    const failedLogs = syncLogList.filter((l: any) => l.status === 'FAILED');
    const totalSparePartsCost = sparePartList.reduce((sum, p) => sum + (p.defaultCost || 0), 0);

    return (
        <div className="space-y-6 pb-6" dir="rtl">
            {/* Hero */}
            <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary/95 to-primary/90 rounded-2xl p-6 text-white shadow-lg">
                <div className="relative z-10">
                    <h1 className="text-2xl font-black tracking-tight">مركز التحكم الرئيسي</h1>
                    <p className="text-white/60 font-bold text-xs mt-1">متابعة حالة الفروع والمزامنة والمخزون</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={<Building2 />} label="فروع متصلة" value={onlineBranches.length} color="text-success" bgColor="bg-success/10" />
                <StatCard icon={<WifiOff />} label="فروع غير متصلة" value={offlineBranches.length} color="text-slate-400" bgColor="bg-slate-100" />
                <StatCard icon={<Package />} label="قطع غيار" value={sparePartList.length} color="text-primary" bgColor="bg-primary/10" />
                <StatCard icon={<AlertTriangle />} label="أخطاء مزامنة" value={failedLogs.length} color="text-destructive" bgColor="bg-destructive/10" />
            </div>

            {/* Branch Status + Recent Sync Errors */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Branch Connection Status */}
                <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-border/50 flex items-center justify-between">
                        <div>
                            <h3 className="font-black text-primary text-sm uppercase tracking-widest">حالة الفروع</h3>
                            <p className="text-[10px] text-muted-foreground font-bold">آخر حالة اتصال</p>
                        </div>
                        <button onClick={() => navigate('/branches')} className="text-[10px] text-primary font-bold hover:underline flex items-center gap-1">
                            عرض الكل <ChevronRight size={12} />
                        </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-border/50">
                        {branchList.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground font-bold">لا توجد فروع</div>
                        ) : branchList.map((b: any) => (
                            <div key={b.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2.5 h-2.5 rounded-full ${b.status === 'ONLINE' ? 'bg-success animate-pulse' : 'bg-slate-300'}`} />
                                    <div>
                                        <span className="text-sm font-bold text-foreground">{b.name}</span>
                                        <span className="text-[10px] text-muted-foreground font-mono mr-2">{b.code}</span>
                                    </div>
                                </div>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${b.status === 'ONLINE' ? 'bg-success/10 text-success' : 'bg-slate-100 text-slate-400'}`}>
                                    {b.status === 'ONLINE' ? 'متصل' : 'غير متصل'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recent Sync Errors */}
                <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-border/50 flex items-center justify-between">
                        <div>
                            <h3 className="font-black text-destructive text-sm uppercase tracking-widest flex items-center gap-2">
                                <AlertTriangle size={16} /> أخطاء المزامنة
                            </h3>
                            <p className="text-[10px] text-muted-foreground font-bold">آخر الأخطاء من الفروع</p>
                        </div>
                        <button onClick={() => navigate('/settings')} className="text-[10px] text-primary font-bold hover:underline flex items-center gap-1">
                            سجل كامل <ChevronRight size={12} />
                        </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-border/50">
                        {failedLogs.length === 0 ? (
                            <div className="p-8 text-center">
                                <Activity size={24} className="mx-auto mb-2 text-success/50" />
                                <p className="text-sm font-bold text-success">لا توجد أخطاء — النظام يعمل بشكل ممتاز</p>
                            </div>
                        ) : failedLogs.map((log: any) => (
                            <div key={log.id} className="px-5 py-3 hover:bg-destructive/5 transition-colors">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-black text-destructive">{log.type}</span>
                                    <span className="text-[10px] text-muted-foreground font-bold">
                                        {new Date(log.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                                    </span>
                                </div>
                                <p className="text-sm font-bold text-foreground">{log.message}</p>
                                {log.branchCode && <span className="text-[10px] text-muted-foreground font-mono mt-1 block">{log.branchCode}</span>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Spare Parts Stats */}
            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-border/50 flex items-center justify-between">
                    <div>
                        <h3 className="font-black text-primary text-sm uppercase tracking-widest flex items-center gap-2">
                            <Package size={16} /> قانون قطع الغيار
                        </h3>
                        <p className="text-[10px] text-muted-foreground font-bold">ملخص الكتالوج</p>
                    </div>
                    <button onClick={() => navigate('/settings')} className="text-[10px] text-primary font-bold hover:underline flex items-center gap-1">
                        إدارة <ChevronRight size={12} />
                    </button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-5">
                    <div className="bg-muted/30 rounded-xl p-4 text-center">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">العدد الكلي</p>
                        <p className="text-2xl font-black text-primary">{sparePartList.length}</p>
                    </div>
                    <div className="bg-muted/30 rounded-xl p-4 text-center">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">استهلاكية</p>
                        <p className="text-2xl font-black text-success">{sparePartList.filter(p => p.isConsumable).length}</p>
                    </div>
                    <div className="bg-muted/30 rounded-xl p-4 text-center">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">أعلى سعر</p>
                        <p className="text-2xl font-black text-amber-600">{sparePartList.length > 0 ? Math.max(...sparePartList.map(p => p.defaultCost || 0)) : 0} ج.م</p>
                    </div>
                    <div className="bg-muted/30 rounded-xl p-4 text-center">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">إجمالي الأسعار</p>
                        <p className="text-2xl font-black text-primary">{totalSparePartsCost.toLocaleString()} ج.م</p>
                    </div>
                </div>
            </div>

            {/* Recent Sync Activity */}
            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-border/50 flex items-center justify-between">
                    <div>
                        <h3 className="font-black text-primary text-sm uppercase tracking-widest">آخر أنشطة المزامنة</h3>
                        <p className="text-[10px] text-muted-foreground font-bold">جميع الفروع</p>
                    </div>
                </div>
                <div className="divide-y divide-border/50">
                    {syncLogList.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground font-bold">لا توجد سجلات</div>
                    ) : syncLogList.slice(0, 8).map((log: any) => (
                        <div key={log.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className={`w-2.5 h-2.5 rounded-full ${log.status === 'SUCCESS' ? 'bg-success' : 'bg-destructive'}`} />
                                <div>
                                    <span className="text-sm font-bold">{log.message}</span>
                                    {log.branchName && <span className="text-[10px] text-muted-foreground mr-2 font-mono">{log.branchName}</span>}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${log.status === 'SUCCESS' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                                    {log.status === 'SUCCESS' ? 'نجاح' : 'فشل'}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-bold">
                                    {new Date(log.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, color, bgColor }: any) {
    return (
        <div className="bg-white rounded-2xl border-2 border-primary/10 p-4 shadow-sm hover:shadow-md transition-all">
            <div className={`w-10 h-10 rounded-xl ${bgColor} ${color} flex items-center justify-center mb-3`}>
                {icon}
            </div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
        </div>
    );
}
