import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import adminClient from '../api/adminClient';
import { 
  TrendingUp, DollarSign, RefreshCw, 
  Calendar, Building, ArrowUpRight, ArrowDownRight,
  Wrench, Package, Warehouse,
  ArrowDownCircle, ArrowUpCircle, CreditCard
} from 'lucide-react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell
} from 'recharts';
import PullReportsButton from '../components/PullReportsButton';

const reportTabs = [
  { id: 'financial', label: 'التدقيق المالي', icon: DollarSign },
  { id: 'movements', label: 'حركات المخزون', icon: RefreshCw },
  { id: 'requests', label: 'طلبات الصيانة', icon: Wrench },
  { id: 'payments', label: 'المدفوعات', icon: CreditCard },
  { id: 'sales', label: 'المبيعات', icon: DollarSign },
  { id: 'installments', label: 'الأقساط المتأخرة', icon: Calendar },
  { id: 'inventory', label: 'جرد المخزون', icon: Warehouse },
  { id: 'spare-parts-inventory', label: 'قطع الغيار', icon: Package },
  { id: 'simcards', label: 'الشرائح', icon: Package },
];

const statusMap: any = {
    'NEW': { label: 'جديد', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    'ASSIGNED': { label: 'محدد له فني', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    'IN_PROGRESS': { label: 'قيد الصيانة', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    'PENDING_APPROVAL': { label: 'في انتظار الموافقة', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    'PENDING_PARTS': { label: 'في انتظار قطع الغيار', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    'CLOSED': { label: 'مغلق', color: 'bg-green-50 text-green-700 border-green-200' },
    'CANCELLED': { label: 'ملغى', color: 'bg-slate-100 text-slate-500 border-slate-200' }
};

const paymentTypeMap: any = {
    'INSTALLMENT': { label: 'قسط', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    'LEGACY_INSTALLMENT': { label: 'قسط (سابق)', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    'MAINTENANCE': { label: 'صيانة', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    'SALE': { label: 'بيع', color: 'bg-green-50 text-green-700 border-green-200' },
    'EXCHANGE': { label: 'استبدال', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    'REFUND': { label: 'استرجاع', color: 'bg-red-50 text-red-700 border-red-200' },
    'OTHER': { label: 'أخرى', color: 'bg-slate-100 text-slate-500 border-slate-200' }
};

export default function Reports() {
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const [chartReady, setChartReady] = useState(false);
    const [filters, setFilters] = useState({
        branchId: '',
        type: 'ALL',
        startDate: '',
        endDate: '',
        search: ''
    });

    const activeTab = reportTabs.find(t => {
        if (t.id === 'financial') return location.pathname === '/reports' || location.pathname === '/reports/financial';
        return location.pathname === `/reports/${t.id}`;
    })?.id || 'financial';

    useEffect(() => {
        const timer = setTimeout(() => setChartReady(true), 100);
        return () => clearTimeout(timer);
    }, []);

    const { data: branches } = useQuery({
        queryKey: ['branches-list'],
        queryFn: () => adminClient.get('/branches').then(r => r.data)
    });

    // Use branch summaries for financial data (counts from branches)
    const { data: branchSummaries } = useQuery({
        queryKey: ['branch-summaries'],
        queryFn: () => adminClient.get('/dashboard/branch-summaries').then(r => r.data),
        enabled: activeTab === 'financial'
    });

    const { data: stockMovements } = useQuery({
        queryKey: ['stock-movements', filters.branchId],
        queryFn: () => {
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            if (filters.type !== 'ALL') params.append('type', filters.type);
            return adminClient.get(`/stock-movements?${params}`).then(r => r.data);
        },
        enabled: activeTab === 'movements'
    });

    const { data: maintenanceRequests } = useQuery({
        queryKey: ['maintenance-requests', filters.branchId],
        queryFn: () => {
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            return adminClient.get(`/maintenance-requests?${params}`).then(r => r.data);
        },
        enabled: activeTab === 'requests'
    });

    const { data: payments } = useQuery({
        queryKey: ['payments', filters.branchId, filters.type],
        queryFn: () => {
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            if (filters.type !== 'ALL') params.append('type', filters.type);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            return adminClient.get(`/payments?${params}`).then(r => r.data);
        },
        enabled: activeTab === 'payments'
    });

    const { data: inventory } = useQuery({
        queryKey: ['inventory-all', filters.branchId],
        queryFn: () => {
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            return adminClient.get(`/inventory/all?${params}`).then(r => r.data);
        },
        enabled: activeTab === 'inventory'
    });

    const { data: sparePartsReport } = useQuery({
        queryKey: ['spare-parts-report', filters.branchId],
        queryFn: () => {
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            return adminClient.get(`/inventory/spare-parts-report?${params}`).then(r => r.data);
        },
        enabled: activeTab === 'spare-parts-inventory'
    });

    const { data: sales } = useQuery({
        queryKey: ['sales', filters.branchId, filters.type],
        queryFn: () => {
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            if (filters.type !== 'ALL') params.append('type', filters.type);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            return adminClient.get(`/sales?${params}`).then(r => r.data);
        },
        enabled: activeTab === 'sales'
    });

    const { data: overdueInstallments } = useQuery({
        queryKey: ['overdue-installments', filters.branchId],
        queryFn: () => {
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            return adminClient.get(`/sales/overdue-installments?${params}`).then(r => r.data);
        },
        enabled: activeTab === 'installments'
    });

    const { data: simCards } = useQuery({
        queryKey: ['simcards', filters.branchId],
        queryFn: () => {
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            return adminClient.get(`/simcards?${params}`).then(r => r.data);
        },
        enabled: activeTab === 'simcards'
    });

    const { data: simMovements } = useQuery({
        queryKey: ['sim-movements', filters.branchId],
        queryFn: () => {
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            return adminClient.get(`/simcard-reports/movements?${params}`).then(r => r.data);
        },
        enabled: activeTab === 'simcards'
    });



    const COLORS = ['#0A2472', '#0E6BA8', '#A6E1FA', '#001D4A', '#22C55E'];

    const movements = Array.isArray(stockMovements?.data) ? stockMovements.data : [];
    const requests = Array.isArray(maintenanceRequests?.data) ? maintenanceRequests.data : [];
    const paymentsData = Array.isArray(payments?.data) ? payments.data : [];
    const inventoryData = Array.isArray(inventory?.data) ? inventory.data : [];

    const filteredMovements = filters.search 
        ? (Array.isArray(movements) ? movements : []).filter((m: any) => m.partName?.toLowerCase().includes(filters.search.toLowerCase()) || m.branchName?.toLowerCase().includes(filters.search.toLowerCase()))
        : (Array.isArray(movements) ? movements : []);
    const filteredRequests = filters.search 
        ? (Array.isArray(requests) ? requests : []).filter((r: any) => r.customerName?.toLowerCase().includes(filters.search.toLowerCase()) || r.machineSerial?.toLowerCase().includes(filters.search.toLowerCase()))
        : (Array.isArray(requests) ? requests : []);
    const filteredPayments = filters.search 
        ? (Array.isArray(paymentsData) ? paymentsData : []).filter((p: any) => p.customerName?.toLowerCase().includes(filters.search.toLowerCase()) || p.receiptNumber?.toLowerCase().includes(filters.search.toLowerCase()))
        : (Array.isArray(paymentsData) ? paymentsData : []);
    const filteredInventory = filters.search 
        ? (Array.isArray(inventoryData) ? inventoryData : []).filter((i: any) => i.partName?.toLowerCase().includes(filters.search.toLowerCase()) || i.partNumber?.toLowerCase().includes(filters.search.toLowerCase()))
        : (Array.isArray(inventoryData) ? inventoryData : []);

    const totalPaymentsAmount = filteredPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    const totalInventoryQty = filteredInventory.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);

    const renderFilters = () => (
        <div className="bg-white rounded-2xl p-4 border-2 border-primary/10 shadow-sm mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <input 
                    type="text" 
                    className="smart-input"
                    placeholder="بحث..."
                    value={filters.search}
                    onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
                />
            </div>
        </div>
    );

    const renderMovements = () => (
        <div className="space-y-6">
            {renderFilters()}

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
                            {filteredMovements.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-bold">لا توجد بيانات</td></tr>
                            ) : (
                                filteredMovements.map((m: any) => (
                                    <tr key={m.id} className="hover:bg-slate-50">
                                        <td className="p-3 text-sm font-bold">{new Date(m.date).toLocaleDateString('ar-EG')}</td>
                                        <td className="p-3 text-sm font-bold text-primary">{m.branchName}</td>
                                        <td className="p-3 text-sm"><div className="font-bold">{m.partName}</div><div className="text-[10px] text-slate-400 font-mono">{m.partNumber}</div></td>
                                        <td className="p-3">
                                            {m.type === 'IN' ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-700 font-black text-[10px] border border-green-200"><ArrowDownCircle size={12} /> دخول</span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-700 font-black text-[10px] border border-red-200"><ArrowUpCircle size={12} /> خروج</span>
                                            )}
                                        </td>
                                        <td className="p-3 text-lg font-black">{m.quantity}</td>
                                        <td className="p-3 text-sm font-bold text-slate-500">{m.reason}</td>
                                        <td className="p-3 text-sm">{m.customerName || '-'}</td>
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

    const renderRequests = () => (
        <div className="space-y-6">
            {renderFilters()}
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
                            {filteredRequests.length === 0 ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold">لا توجد بيانات</td></tr>
                            ) : (
                                filteredRequests.map((r: any) => (
                                    <tr key={r.id} className="hover:bg-slate-50">
                                        <td className="p-3 text-sm font-bold">{new Date(r.date).toLocaleDateString('ar-EG')}</td>
                                        <td className="p-3 text-sm font-bold text-primary">{r.branchName}</td>
                                        <td className="p-3 text-sm"><div className="font-bold">{r.customerName}</div><div className="text-[10px] text-slate-400">{r.customerCode}</div></td>
                                        <td className="p-3 text-sm"><div className="font-mono text-xs">{r.machineSerial}</div><div className="text-[10px] text-slate-400">{r.machineModel}</div></td>
                                        <td className="p-3"><span className={`inline-flex px-2 py-1 rounded-full font-black text-[10px] border ${statusMap[r.status]?.color || 'bg-slate-100'}`}>{statusMap[r.status]?.label || r.status}</span></td>
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

    const renderPayments = () => (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-center justify-between">
                    <div><p className="text-white/60 font-bold text-sm">إجمالي المدفوعات</p><p className="text-3xl font-black mt-1">{totalPaymentsAmount.toLocaleString()} ج.م</p></div>
                    <CreditCard size={48} className="text-white/30" />
                </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border-2 border-primary/10 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <select className="smart-select" value={filters.branchId} onChange={(e) => setFilters(f => ({ ...f, branchId: e.target.value }))}>
                        <option value="">كل الفروع</option>
                        {branches?.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                    </select>
                    <select className="smart-select" value={filters.type} onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}>
                        <option value="ALL">كل الأنواع</option>
                        {Object.entries(paymentTypeMap).map(([key, v]: any) => (<option key={key} value={key}>{v.label}</option>))}
                    </select>
                    <input type="date" className="smart-input" value={filters.startDate} onChange={(e) => setFilters(f => ({ ...f, startDate: e.target.value }))} />
                    <input type="date" className="smart-input" value={filters.endDate} onChange={(e) => setFilters(f => ({ ...f, endDate: e.target.value }))} />
                    <input type="text" className="smart-input" placeholder="بحث..." value={filters.search} onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))} />
                </div>
            </div>
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
                            {filteredPayments.length === 0 ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold">لا توجد بيانات</td></tr>
                            ) : (
                                filteredPayments.map((p: any) => (
                                    <tr key={p.id} className="hover:bg-slate-50">
                                        <td className="p-3 text-sm font-bold">{new Date(p.date).toLocaleDateString('ar-EG')}</td>
                                        <td className="p-3 text-sm font-bold text-primary">{p.branchName}</td>
                                        <td className="p-3 text-sm"><div className="font-bold">{p.customerName}</div><div className="text-[10px] text-slate-400">{p.customerCode}</div></td>
                                        <td className="p-3"><span className={`inline-flex px-2 py-1 rounded-full font-black text-[10px] border ${paymentTypeMap[p.type]?.color || 'bg-slate-100'}`}>{paymentTypeMap[p.type]?.label || p.type}</span></td>
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

    const renderInventory = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl p-4 border-2 border-primary/10 shadow-sm">
                    <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Package className="text-primary" size={20} /></div><div><p className="text-[10px] font-black text-slate-400 uppercase">إجمالي القطع</p><p className="text-xl font-black text-primary">{filteredInventory.length}</p></div></div>
                </div>
                <div className="bg-white rounded-2xl p-4 border-2 border-primary/10 shadow-sm">
                    <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><Package className="text-green-600" size={20} /></div><div><p className="text-[10px] font-black text-slate-400 uppercase">إجمالي الكمية</p><p className="text-xl font-black text-green-600">{totalInventoryQty}</p></div></div>
                </div>
            </div>
            {renderFilters()}
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
                            {filteredInventory.length === 0 ? (
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

    const renderSparePartsInventory = () => {
        const currentStock = sparePartsReport?.currentStock || { totalItems: 0, totalQuantity: 0, items: [] };
        const outgoingItems = sparePartsReport?.outgoingItems || { total: 0, items: [] };

        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-2xl p-4 border-2 border-primary/10 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                <Package className="text-blue-600" size={20} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase">إجمالي الأصناف</p>
                                <p className="text-xl font-black text-blue-600">{currentStock.totalItems}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border-2 border-green-500/10 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                                <Package className="text-green-600" size={20} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase">إجمالي الكمية</p>
                                <p className="text-xl font-black text-green-600">{currentStock.totalQuantity}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border-2 border-amber-500/10 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                                <Package className="text-amber-600" size={20} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase">مخرج (خارج)</p>
                                <p className="text-xl font-black text-amber-600">{outgoingItems.total}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {renderFilters()}

                <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200">
                        <h3 className="font-black text-primary">المخزون الحالي (الكمية &gt; 0)</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="p-3 text-xs font-black text-slate-500 uppercase">الفرع</th>
                                    <th className="p-3 text-xs font-black text-slate-500 uppercase">رقم القطعة</th>
                                    <th className="p-3 text-xs font-black text-slate-500 uppercase">اسم القطعة</th>
                                    <th className="p-3 text-xs font-black text-slate-500 uppercase text-right">الكمية</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {currentStock.items.length === 0 ? (
                                    <tr><td colSpan={4} className="p-8 text-center text-slate-400 font-bold">لا توجد بيانات</td></tr>
                                ) : (
                                    currentStock.items.map((i: any) => (
                                        <tr key={i.id} className="hover:bg-slate-50">
                                            <td className="p-3 text-sm font-bold text-primary">{i.branchName}</td>
                                            <td className="p-3 text-sm font-mono text-slate-500">{i.partCode}</td>
                                            <td className="p-3 text-sm font-bold">{i.partName}</td>
                                            <td className="p-3 text-lg font-black text-green-600 text-right">{i.quantity}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border-2 border-amber-500/10 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200">
                        <h3 className="font-black text-amber-600">قطع غيار خارج (مستهلكة)</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="p-3 text-xs font-black text-slate-500 uppercase">التاريخ</th>
                                    <th className="p-3 text-xs font-black text-slate-500 uppercase">العميل</th>
                                    <th className="p-3 text-xs font-black text-slate-500 uppercase">كود العميل</th>
                                    <th className="p-3 text-xs font-black text-slate-500 uppercase">الجهاز</th>
                                    <th className="p-3 text-xs font-black text-slate-500 uppercase">رقم القطعة</th>
                                    <th className="p-3 text-xs font-black text-slate-500 uppercase">اسم القطعة</th>
                                    <th className="p-3 text-xs font-black text-slate-500 uppercase text-right">الكمية</th>
                                    <th className="p-3 text-xs font-black text-slate-500 uppercase">مدفوع</th>
                                    <th className="p-3 text-xs font-black text-slate-500 uppercase">مكان الدفع</th>
                                    <th className="p-3 text-xs font-black text-slate-500 uppercase">رقم إيصال</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {outgoingItems.items.length === 0 ? (
                                    <tr><td colSpan={10} className="p-8 text-center text-slate-400 font-bold">لا توجد بيانات</td></tr>
                                ) : (
                                    outgoingItems.items.map((i: any) => (
                                        <tr key={i.id} className="hover:bg-slate-50">
                                            <td className="p-3 text-sm">{i.date ? new Date(i.date).toLocaleDateString('ar-EG') : '-'}</td>
                                            <td className="p-3 text-sm font-bold">{i.clientName}</td>
                                            <td className="p-3 text-sm font-mono text-slate-500">{i.clientCode}</td>
                                            <td className="p-3 text-sm font-mono text-slate-500">{i.terminalSerial}</td>
                                            <td className="p-3 text-sm font-mono text-slate-500">{i.partCode}</td>
                                            <td className="p-3 text-sm font-bold">{i.partName}</td>
                                            <td className="p-3 text-sm font-black text-right">{i.quantity}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${i.isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {i.isPaid ? 'نعم' : 'لا'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-sm">{i.paymentPlace}</td>
                                            <td className="p-3 text-sm font-mono text-slate-500">{i.receiptNumber}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };



    const salesData = Array.isArray(sales?.data) ? sales.data : (Array.isArray(sales) ? sales : []);
    const overdueData = Array.isArray(overdueInstallments?.data) ? overdueInstallments.data : (Array.isArray(overdueInstallments) ? overdueInstallments : []);
    const simData = Array.isArray(simCards?.data) ? simCards.data : (Array.isArray(simCards) ? simCards : []);
    const simMovData = Array.isArray(simMovements?.data) ? simMovements.data : (Array.isArray(simMovements) ? simMovements : []);
    const totalOverdue = overdueInstallments?.totalOverdue || 0;
    const totalSalesAmount = salesData.reduce((sum: number, s: any) => sum + (s.totalPrice || 0), 0);
    const totalCashSales = salesData.filter((s: any) => s.type === 'CASH');
    const totalInstallmentSales = salesData.filter((s: any) => ['INSTALLMENT', 'LEGACY_INSTALLMENT'].includes(s.type));

    const renderSales = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-6 text-white shadow-lg">
                    <div className="flex items-center justify-between"><div><p className="text-white/60 font-bold text-sm">إجمالي المبيعات</p><p className="text-3xl font-black mt-1">{totalSalesAmount.toLocaleString()} ج.م</p></div><DollarSign size={48} className="text-white/30" /></div>
                </div>
                <div className="bg-white rounded-2xl p-6 border-2 border-primary/10 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase">مبيعات كاش</p>
                    <p className="text-2xl font-black text-green-600">{totalCashSales.length}</p>
                    <p className="text-sm text-slate-500">{totalCashSales.reduce((sum: number, s: any) => sum + s.totalPrice, 0).toLocaleString()} ج.م</p>
                </div>
                <div className="bg-white rounded-2xl p-6 border-2 border-primary/10 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase">مبيعات تقسيط</p>
                    <p className="text-2xl font-black text-amber-600">{totalInstallmentSales.length}</p>
                    <p className="text-sm text-slate-500">{totalInstallmentSales.reduce((sum: number, s: any) => sum + s.totalPrice, 0).toLocaleString()} ج.م</p>
                </div>
            </div>
            {renderFilters()}
            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">التاريخ</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الفرع</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">العميل</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">سيريال</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">النوع</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الإجمالي</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">المدفوع</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">المتبقي</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {salesData.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-bold">لا توجد بيانات</td></tr>
                            ) : (
                                salesData.map((s: any) => (
                                    <tr key={s.id} className="hover:bg-slate-50">
                                        <td className="p-3 text-sm font-bold">{new Date(s.saleDate).toLocaleDateString('ar-EG')}</td>
                                        <td className="p-3 text-sm font-bold text-primary">{s.branchName}</td>
                                        <td className="p-3 text-sm"><div className="font-bold">{s.customerName}</div><div className="text-[10px] text-slate-400">{s.customerCode}</div></td>
                                        <td className="p-3 text-sm font-mono">{s.serialNumber}</td>
                                        <td className="p-3"><span className={`inline-flex px-2 py-1 rounded-full font-black text-[10px] border ${s.type === 'CASH' ? 'bg-green-50 text-green-700 border-green-200' : s.type === 'LEGACY_INSTALLMENT' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{s.type === 'CASH' ? 'كاش' : s.type === 'LEGACY_INSTALLMENT' ? 'قسط (سابق)' : 'تقسيط'}</span></td>
                                        <td className="p-3 text-lg font-black">{s.totalPrice?.toLocaleString()}</td>
                                        <td className="p-3 text-sm font-bold text-green-600">{s.paidAmount?.toLocaleString()}</td>
                                        <td className="p-3 text-sm font-bold text-red-600">{s.remaining?.toLocaleString()}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderInstallments = () => (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-red-600 to-orange-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-center justify-between"><div><p className="text-white/60 font-bold text-sm">إجمالي الأقساط المتأخرة</p><p className="text-3xl font-black mt-1">{totalOverdue.toLocaleString()} ج.م</p></div><Calendar size={48} className="text-white/30" /></div>
            </div>
            <div className="bg-white rounded-2xl p-4 border-2 border-primary/10 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <select className="smart-select" value={filters.branchId} onChange={(e) => setFilters(f => ({ ...f, branchId: e.target.value }))}>
                        <option value="">كل الفروع</option>
                        {branches?.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                    </select>
                </div>
            </div>
            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الفرع</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">العميل</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">سيريال</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">تاريخ الاستحقاق</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">المبلغ</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">أيام التأخير</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">رقم الإيصال</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {overdueData.length === 0 ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold">لا توجد أقساط متأخرة</td></tr>
                            ) : (
                                overdueData.map((i: any) => (
                                    <tr key={i.id} className="hover:bg-slate-50">
                                        <td className="p-3 text-sm font-bold text-primary">{i.branchName}</td>
                                        <td className="p-3 text-sm"><div className="font-bold">{i.customerName}</div><div className="text-[10px] text-slate-400">{i.customerCode}</div></td>
                                        <td className="p-3 text-sm font-mono">{i.serialNumber}</td>
                                        <td className="p-3 text-sm font-bold">{new Date(i.dueDate).toLocaleDateString('ar-EG')}</td>
                                        <td className="p-3 text-lg font-black text-red-600">{i.amount?.toLocaleString()}</td>
                                        <td className="p-3"><span className="inline-flex px-2 py-1 rounded-full bg-red-50 text-red-700 font-black text-[10px] border border-red-200">{i.daysOverdue} يوم</span></td>
                                        <td className="p-3 text-sm font-mono text-slate-400">{i.receiptNumber}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderSimCards = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl p-6 border-2 border-primary/10 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase">إجمالي الشرائح</p>
                    <p className="text-2xl font-black text-primary">{simData.length}</p>
                </div>
            </div>
            {renderFilters()}
            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden mb-6">
                <div className="p-4 border-b border-slate-200"><h3 className="font-black text-primary">الشرائح</h3></div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الفرع</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">السيريال</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">النوع</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الشبكة</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">العميل</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {simData.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold">لا توجد بيانات</td></tr>
                            ) : (
                                simData.map((s: any) => (
                                    <tr key={s.id} className="hover:bg-slate-50">
                                        <td className="p-3 text-sm font-bold text-primary">{s.branchName}</td>
                                        <td className="p-3 text-sm font-mono">{s.serialNumber}</td>
                                        <td className="p-3 text-sm">{s.type}</td>
                                        <td className="p-3 text-sm">{s.networkType}</td>
                                        <td className="p-3 text-sm">{s.customerName || '-'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200"><h3 className="font-black text-primary">سجل حركة الشرائح</h3></div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">التاريخ</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الفرع</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">السيريال</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">الإجراء</th>
                                <th className="p-3 text-xs font-black text-slate-500 uppercase">بواسطة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {simMovData.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold">لا توجد بيانات</td></tr>
                            ) : (
                                simMovData.map((m: any) => (
                                    <tr key={m.id} className="hover:bg-slate-50">
                                        <td className="p-3 text-sm font-bold">{new Date(m.date).toLocaleDateString('ar-EG')}</td>
                                        <td className="p-3 text-sm font-bold text-primary">{m.branchName}</td>
                                        <td className="p-3 text-sm font-mono">{m.serialNumber}</td>
                                        <td className="p-3 text-sm font-bold">{m.action}</td>
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

    const renderContent = () => {
        switch (activeTab) {
            case 'movements': return renderMovements();
            case 'requests': return renderRequests();
            case 'payments': return renderPayments();
            case 'sales': return renderSales();
            case 'installments': return renderInstallments();
            case 'inventory': return renderInventory();
            case 'spare-parts-inventory': return renderSparePartsInventory();
            case 'simcards': return renderSimCards();
            default: return renderFinancial();
        }
    };

    const renderFinancial = () => {
        const totals = branchSummaries?.totals || {};
        const branches = branchSummaries?.branches || [];
        
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <SummaryCard title="إجمالي إيرادات المجموعة" value={`${(totals.totalRevenue || 0).toLocaleString()} ج.م`} trend="+15.4%" isUp={true} icon={<DollarSign />} />
                    <SummaryCard title="عدد الفروع" value={branches.length} trend="+" isUp={true} icon={<Building />} />
                    <SummaryCard title="إجمالي المدفوعات" value={totals.paymentCount || 0} trend="—" isUp={false} icon={<Calendar />} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {[
                        { label: 'العملاء', value: totals.customerCount || 0, color: 'text-blue-600' },
                        { label: 'المبيعات', value: totals.salesCount || 0, color: 'text-green-600' },
                        { label: 'طلبات الصيانة', value: totals.requestCount || 0, color: 'text-amber-600' },
                        { label: 'الأقساط', value: totals.installmentCount || 0, color: 'text-purple-600' },
                        { label: 'حركات المخزون', value: totals.stockMovementCount || 0, color: 'text-slate-600' },
                        { label: 'الشرائح', value: totals.simCardCount || 0, color: 'text-cyan-600' },
                    ].map(item => (
                        <div key={item.label} className="bg-white rounded-xl p-3 border border-slate-200">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{item.label}</p>
                            <p className={`text-xl font-black ${item.color}`}>{item.value.toLocaleString()}</p>
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 bg-white rounded-2xl p-6 border-2 border-primary/10 shadow-md">
                        <div className="flex justify-between items-center mb-6">
                            <div><h3 className="text-lg font-black text-primary tracking-tight uppercase">تصنيف أرباح الفروع</h3><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">تتبع أداء الفروع في الوقت الفعلي</p></div>
                        </div>
                        <div className="h-72 w-full" dir="ltr">
                            <div style={{ width: '100%', height: 300 }}>
                                {chartReady ? (
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <BarChart data={branches}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                                        <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', padding: '1rem', textAlign: 'right' }} />
                                        <Bar dataKey="totalRevenue" radius={[10, 10, 0, 0]} barSize={50}>
                                            {branches.map((_entry: any, index: number) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                                ) : (
                                    <div className="flex items-center justify-center h-full text-slate-400 font-bold">جاري التحميل...</div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl p-6 border-2 border-primary/10 shadow-md">
                        <div className="mb-6 text-right"><h3 className="text-lg font-black text-primary tracking-tight uppercase">ملخص الفروع</h3><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">إحصائيات كل فرع</p></div>
                        <div className="space-y-4">
                            {[...branches].sort((a: any, b: any) => (b.totalRevenue || 0) - (a.totalRevenue || 0)).map((b: any, idx: number) => (
                                <div key={b.id} className="flex items-center justify-between group cursor-default flex-row-reverse">
                                    <div className="flex items-center gap-3 flex-row-reverse">
                                        <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center font-black text-muted-foreground group-hover:bg-primary group-hover:text-white transition-all shrink-0">{idx + 1}</div>
                                        <div className="text-right"><p className="text-sm font-black text-primary uppercase group-hover:text-primary/70 transition-colors">{b.name}</p><p className="text-[9px] font-bold text-muted-foreground/40 uppercase mt-0.5">{b.code}</p></div>
                                    </div>
                                    <div className="text-left"><p className="text-sm font-black text-muted-foreground">{(b.totalRevenue || 0).toLocaleString()} ج.م</p></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 font-arabic" dir="rtl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl lg:text-2xl font-black text-primary uppercase tracking-tight flex items-center gap-3">
                        <TrendingUp className="text-brand-cyan" size={24} />
                        التقارير <span className="text-brand-cyan">والتصدير</span>
                    </h1>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">مراجعة البيانات والتقارير عبر شبكة الفروع</p>
                </div>
                <PullReportsButton branches={branches || []} onSuccess={() => {
                    queryClient.invalidateQueries();
                }} />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2">
                {reportTabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => navigate(`/reports/${tab.id === 'financial' ? '' : tab.id}`)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-sm whitespace-nowrap transition-all ${
                                isActive ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border-2 border-slate-200 hover:border-primary/30 hover:text-primary'
                            }`}
                        >
                            <Icon size={16} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {renderContent()}
        </div>
    );
}

function SummaryCard({ title, value, trend, isUp, icon }: any) {
    return (
        <div className="bg-white p-5 rounded-2xl border-2 border-primary/10 shadow-sm hover:shadow-md transition-all group relative overflow-hidden text-right">
            <div className="flex justify-between items-start relative z-10 flex-row-reverse">
                <div className="w-10 h-10 bg-primary/5 text-primary rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-white transition-all">{icon}</div>
                <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter ${isUp ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                    {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{trend}
                </div>
            </div>
            <div className="relative z-10">
                <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.2em] mb-1">{title}</p>
                <h2 className="text-xl font-black text-primary tracking-tighter uppercase">{value}</h2>
            </div>
        </div>
    );
}
