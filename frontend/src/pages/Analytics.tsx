import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    Users, Monitor, Smartphone, Wrench, 
    TrendingUp, Calendar, Building2, RefreshCw
} from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie
} from 'recharts';
import adminClient from '../api/adminClient';

export default function AnalyticsDashboard() {
    const [filters, setFilters] = useState({ branchId: '' });
    const [chartReady, setChartReady] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setChartReady(true), 100);
        return () => clearTimeout(timer);
    }, []);

    const { data: branches } = useQuery({
        queryKey: ['branches-list'],
        queryFn: () => adminClient.get('/branches').then(r => r.data)
    });

    // Use branch summaries instead of direct DB queries (which are empty)
    const { data: branchSummaries } = useQuery({
        queryKey: ['branch-summaries'],
        queryFn: () => adminClient.get('/dashboard/branch-summaries').then(r => r.data)
    });

    const branchBreakdown = branchSummaries?.branches || [];
    const totals = branchSummaries?.totals || {};
    
    const totalCustomers = totals.customerCount || 0;
    const totalSales = totals.salesCount || 0;
    const totalMaintenanceRequests = totals.requestCount || 0;
    const totalPayments = totals.paymentCount || 0;
    const totalSimCards = totals.simCardCount || 0;
    const totalInventoryQty = totals.stockMovementCount || 0;
    const totalRevenue = totals.totalRevenue || 0;
    const totalMachines = totals.posMachineCount || 0;

    const maintenanceStatusData = [];
    const paymentTypeData = [];
    const salesTypeData = [
        { name: 'كاش', value: 0, revenue: 0 },
        { name: 'تقسيط', value: 0, revenue: 0 }
    ];


    const COLORS = ['#0A2472', '#0E6BA8', '#A6E1FA', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6'];

    return (
        <div className="space-y-6" dir="rtl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl lg:text-2xl font-black text-primary uppercase flex items-center gap-3">
                        <TrendingUp className="text-brand-cyan" size={24} />
                        لوحة التحليلات
                    </h1>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">
                        نظرة شاملة على أداء المجموعة
                    </p>
                </div>
                <select 
                    className="smart-select"
                    value={filters.branchId}
                    onChange={(e) => setFilters(f => ({ ...f, branchId: e.target.value }))}
                >
                    <option value="">كل الفروع</option>
                    {branches?.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard title="إجمالي العملاء" value={totalCustomers} icon={<Users size={20} />} color="text-blue-600" bgColor="bg-blue-50" />
                <SummaryCard title="إجمالي الماكينات" value={totalMachines} icon={<Monitor size={20} />} color="text-green-600" bgColor="bg-green-50" />
                <SummaryCard title="إجمالي الشرائح" value={totalSimCards} icon={<Smartphone size={20} />} color="text-purple-600" bgColor="bg-purple-50" />
                <SummaryCard title="طلبات الصيانة" value={totalMaintenanceRequests} icon={<Wrench size={20} />} color="text-amber-600" bgColor="bg-amber-50" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard title="المبيعات" value={totalSales} icon={<TrendingUp size={20} />} color="text-emerald-600" bgColor="bg-emerald-50" />
                <SummaryCard title="المدفوعات" value={totalPayments} icon={<Calendar size={20} />} color="text-cyan-600" bgColor="bg-cyan-50" />
                <SummaryCard title="إجمالي الإيرادات" value={`${totalRevenue.toLocaleString()} ج.م`} icon={<Building2 size={20} />} color="text-primary" bgColor="bg-primary/5" />
                <SummaryCard title="كمية المخزون" value={totalInventoryQty} icon={<RefreshCw size={20} />} color="text-slate-600" bgColor="bg-slate-50" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl p-6 border-2 border-primary/10 shadow-sm">
                    <h3 className="text-sm font-black text-primary uppercase mb-4">الإيرادات حسب الفرع</h3>
                    <div className="h-64 w-full" dir="ltr">
                        {chartReady && branchBreakdown.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <BarChart data={branchBreakdown}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9, fontWeight: 700 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9, fontWeight: 700 }} />
                                    <Tooltip contentStyle={{ borderRadius: '0.75rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', textAlign: 'right' }} />
                                    <Bar dataKey="totalRevenue" radius={[8, 8, 0, 0]}>
                                        {branchBreakdown.map((_entry: any, index: number) => (<Cell key={index} fill={COLORS[index % COLORS.length]} />))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-400 font-bold">لا توجد بيانات</div>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border-2 border-primary/10 shadow-sm">
                    <h3 className="text-sm font-black text-primary uppercase mb-4">حالات الصيانة</h3>
                    <div className="h-64 w-full">
                        {chartReady && maintenanceStatusData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <PieChart>
                                    <Pie data={maintenanceStatusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }: any) => `${name}: ${value}`}>
                                        {maintenanceStatusData.map((_entry: any, index: number) => (<Cell key={index} fill={COLORS[index % COLORS.length]} />))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-400 font-bold">لا توجد بيانات</div>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border-2 border-primary/10 shadow-sm">
                    <h3 className="text-sm font-black text-primary uppercase mb-4">المبيعات حسب النوع</h3>
                    <div className="space-y-4">
                        {salesTypeData.map((s: any) => (
                            <div key={s.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <div>
                                    <p className="font-black text-sm text-primary">{s.name}</p>
                                    <p className="text-[10px] text-slate-400">{s.value} عملية</p>
                                </div>
                                <p className="text-lg font-black text-green-600">{s.revenue?.toLocaleString() || 0} ج.م</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border-2 border-primary/10 shadow-sm">
                    <h3 className="text-sm font-black text-primary uppercase mb-4">المدفوعات حسب النوع</h3>
                    <div className="space-y-4">
                        {paymentTypeData.length > 0 ? paymentTypeData.map((p: any) => (
                            <div key={p.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <div>
                                    <p className="font-black text-sm text-primary">{p.name}</p>
                                    <p className="text-[10px] text-slate-400">{p.count} عملية</p>
                                </div>
                                <p className="text-lg font-black text-green-600">{p.amount?.toLocaleString() || 0} ج.م</p>
                            </div>
                        )) : (
                            <div className="flex items-center justify-center h-32 text-slate-400 font-bold">لا توجد بيانات</div>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                    <h3 className="font-black text-primary">أداء الفروع</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الفرع</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">العملاء</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الماكينات</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">العمليات</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الإيرادات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {branchBreakdown.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold">لا توجد بيانات - قم بسحب البيانات من الفروع أولاً</td></tr>
                            ) : (
                                branchBreakdown.map((b: any) => (
                                    <tr key={b.branchId} className="hover:bg-slate-50">
                                        <td className="p-3 text-sm font-bold text-primary">{b.branchName}</td>
                                        <td className="p-3 text-sm font-black">{b.customerCount || 0}</td>
                                        <td className="p-3 text-sm font-black">{b.machineCount || 0}</td>
                                        <td className="p-3 text-sm font-black">{b.requestCount || 0}</td>
                                        <td className="p-3 text-sm font-black text-green-600">{b.revenue?.toLocaleString()} ج.م</td>
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

function SummaryCard({ title, value, icon, color, bgColor }: any) {
    return (
        <div className="bg-white rounded-2xl p-4 border-2 border-primary/10 shadow-sm">
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center ${color}`}>{icon}</div>
                <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase">{title}</p>
                    <p className={`text-xl font-black ${color}`}>{value}</p>
                </div>
            </div>
        </div>
    );
}
