import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import adminClient from '../api/adminClient';
import { 
  TrendingUp, DollarSign, RefreshCw, 
  Calendar, Building, ArrowUpRight, ArrowDownRight,
  FileSpreadsheet, Wrench, Package, Warehouse,
  ArrowDownCircle, ArrowUpCircle, Download, CreditCard
} from 'lucide-react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell
} from 'recharts';
import toast from 'react-hot-toast';
import PullReportsButton from '../components/PullReportsButton';

const reportTabs = [
  { id: 'financial', label: 'التدقيق المالي', icon: DollarSign },
  { id: 'movements', label: 'حركات المخزون', icon: RefreshCw },
  { id: 'requests', label: 'طلبات الصيانة', icon: Wrench },
  { id: 'payments', label: 'المدفوعات', icon: CreditCard },
  { id: 'sales', label: 'المبيعات', icon: DollarSign },
  { id: 'installments', label: 'الأقساط المتأخرة', icon: Calendar },
  { id: 'inventory', label: 'جرد المخزون', icon: Warehouse },
  { id: 'simcards', label: 'الشرائح', icon: Package },
  { id: 'price-history', label: 'سعر القطع', icon: Package },
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
    const [data, setData] = useState<any>(null);
    const [exporting, setExporting] = useState(false);
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

    const { data: parts } = useQuery({
        queryKey: ['spare-parts-list'],
        queryFn: () => adminClient.get('/spare-parts').then(r => r.data),
        enabled: activeTab === 'price-history'
    });

    const [selectedPartId, setSelectedPartId] = useState('');
    const { data: priceLogs } = useQuery({
        queryKey: ['price-logs', selectedPartId],
        queryFn: () => adminClient.get(`/spare-parts/${selectedPartId}/price-logs`).then(r => r.data),
        enabled: activeTab === 'price-history' && !!selectedPartId
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

    const fetchReports = async () => {
        try {
            const res = await adminClient.get('/reports/financial-summary');
            setData(res.data);
        } catch (error) {
            toast.error('فشل في تحميل التقارير المالية');
        }
    };

    const handleExport = async (endpoint: string) => {
        try {
            setExporting(true);
            const params = new URLSearchParams();
            if (filters.branchId) params.append('branchId', filters.branchId);
            if (filters.type !== 'ALL') params.append('type', filters.type);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            
            const response = await adminClient.get(`${endpoint}/export?${params}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${endpoint.split('/').pop()}_${new Date().toISOString().slice(0,10)}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('تم تصدير البيانات بنجاح');
        } catch (error) {
            toast.error('فشل في تصدير البيانات');
        } finally {
            setExporting(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'financial') fetchReports();
    }, [activeTab]);

    const COLORS = ['#0A2472', '#0E6BA8', '#A6E1FA', '#001D4A', '#22C55E'];

    const movements = stockMovements?.data || [];
    const requests = maintenanceRequests?.data || [];
    const paymentsData = payments?.data || [];
    const inventoryData = inventory?.data || [];
    const logs = Array.isArray(priceLogs) ? priceLogs : [];

    const filteredMovements = filters.search 
        ? movements.filter((m: any) => m.partName?.toLowerCase().includes(filters.search.toLowerCase()) || m.branchName?.toLowerCase().includes(filters.search.toLowerCase()))
        : movements;
    const filteredRequests = filters.search 
        ? requests.filter((r: any) => r.customerName?.toLowerCase().includes(filters.search.toLowerCase()) || r.machineSerial?.toLowerCase().includes(filters.search.toLowerCase()))
        : requests;
    const filteredPayments = filters.search 
        ? paymentsData.filter((p: any) => p.customerName?.toLowerCase().includes(filters.search.toLowerCase()) || p.receiptNumber?.toLowerCase().includes(filters.search.toLowerCase()))
        : paymentsData;
    const filteredInventory = filters.search 
        ? inventoryData.filter((i: any) => i.partName?.toLowerCase().includes(filters.search.toLowerCase()) || i.partNumber?.toLowerCase().includes(filters.search.toLowerCase()))
        : inventoryData;

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
            <div className="flex justify-end">
                <button onClick={() => handleExport('/stock-movements')} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-black text-sm hover:shadow-md">
                    <Download size={16} /> تصدير Excel
                </button>
            </div>
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
            <div className="flex justify-end">
                <button onClick={() => handleExport('/maintenance-requests')} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-black text-sm hover:shadow-md">
                    <Download size={16} /> تصدير Excel
                </button>
            </div>
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
            <div className="flex justify-end">
                <button onClick={() => handleExport('/payments')} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-black text-sm hover:shadow-md">
                    <Download size={16} /> تصدير Excel
                </button>
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
            <div className="flex justify-end">
                <button onClick={() => handleExport('/inventory')} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-black text-sm hover:shadow-md">
                    <Download size={16} /> تصدير Excel
                </button>
            </div>
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

    const renderPriceHistory = () => (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl p-4 border-2 border-primary/10 shadow-sm">
                <select className="smart-select" value={selectedPartId} onChange={(e) => setSelectedPartId(e.target.value)}>
                    <option value="">اختر قطعة غيار</option>
                    {parts?.map((p: any) => (<option key={p.id} value={p.id}>{p.name} - {p.partNumber}</option>))}
                </select>
            </div>
            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200"><h3 className="font-black text-primary">سجل التغييرات</h3></div>
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
                            {!selectedPartId ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold">اختر قطعة غيار أولاً</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold">لا توجد سجلات</td></tr>
                            ) : (
                                logs.map((log: any) => {
                                    const change = log.newCost - log.oldCost;
                                    const isIncrease = change > 0;
                                    return (
                                        <tr key={log.id} className="hover:bg-slate-50">
                                            <td className="p-3 text-sm font-bold">{new Date(log.changedAt).toLocaleString('ar-EG')}</td>
                                            <td className="p-3 text-sm font-black text-slate-500">{log.oldCost}</td>
                                            <td className="p-3 text-sm font-black text-primary">{log.newCost}</td>
                                            <td className="p-3"><span className={`font-black text-sm ${isIncrease ? 'text-red-600' : 'text-green-600'}`}>{isIncrease ? '+' : ''}{change.toFixed(2)} ج.م</span></td>
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

    const salesData = sales?.data || [];
    const overdueData = overdueInstallments?.data || [];
    const simData = simCards?.data || [];
    const simMovData = simMovements?.data || [];
    const totalOverdue = overdueInstallments?.totalOverdue || 0;
    const totalSalesAmount = salesData.reduce((sum: number, s: any) => sum + (s.totalPrice || 0), 0);
    const totalCashSales = salesData.filter((s: any) => s.type === 'CASH');
    const totalInstallmentSales = salesData.filter((s: any) => s.type === 'INSTALLMENT');

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
                                        <td className="p-3"><span className={`inline-flex px-2 py-1 rounded-full font-black text-[10px] border ${s.type === 'CASH' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{s.type === 'CASH' ? 'كاش' : 'تقسيط'}</span></td>
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
            case 'simcards': return renderSimCards();
            case 'price-history': return renderPriceHistory();
            default: return renderFinancial();
        }
    };

    const renderFinancial = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SummaryCard title="إجمالي إيرادات المجموعة" value={`${data?.totalEnterpriseRevenue?.toLocaleString() || 0} ج.م`} trend="+15.4%" isUp={true} icon={<DollarSign />} />
                <SummaryCard title="متوسط دخل الفرع" value={`${(data?.totalEnterpriseRevenue / (data?.branchBreakdown?.length || 1)).toLocaleString(undefined, {maximumFractionDigits: 0}) || 0} ج.م`} trend="+5.2%" isUp={true} icon={<Building />} />
                <SummaryCard title="مستحقات معلقة" value={`${(paymentsData?.totalAmount || 0).toLocaleString()} ج.م`} trend="—" isUp={false} icon={<Calendar />} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white rounded-2xl p-6 border-2 border-primary/10 shadow-md">
                    <div className="flex justify-between items-center mb-6">
                        <div><h3 className="text-lg font-black text-primary tracking-tight uppercase">تصنيف أرباح الفروع</h3><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">تتبع أداء العقد في الوقت الفعلي</p></div>
                    </div>
                    <div className="h-72 w-full" dir="ltr">
                        <div style={{ width: '100%', height: 300 }}>
                            {chartReady ? (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <BarChart data={data?.branchBreakdown || []}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="branchName" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', padding: '1rem', textAlign: 'right' }} />
                                    <Bar dataKey="revenue" radius={[10, 10, 0, 0]} barSize={50}>
                                        {(data?.branchBreakdown || []).map((_entry: any, index: number) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
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
                    <div className="mb-6 text-right"><h3 className="text-lg font-black text-primary tracking-tight uppercase">تحليل الشبكة</h3><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">تدقيق تقاطع العقد البرمجية</p></div>
                    <div className="space-y-4">
                        {[...(data?.branchBreakdown || [])].sort((a: any, b: any) => b.revenue - a.revenue).map((b: any, idx: number) => (
                            <div key={b.branchId} className="flex items-center justify-between group cursor-default flex-row-reverse">
                                <div className="flex items-center gap-3 flex-row-reverse">
                                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center font-black text-muted-foreground group-hover:bg-primary group-hover:text-white transition-all shrink-0">{idx + 1}</div>
                                    <div className="text-right"><p className="text-sm font-black text-primary uppercase group-hover:text-primary/70 transition-colors">{b.branchName}</p><p className="text-[9px] font-bold text-muted-foreground/40 uppercase mt-0.5">{b.requestCount} عملية</p></div>
                                </div>
                                <div className="text-left"><p className="text-sm font-black text-muted-foreground">{b.revenue.toLocaleString()} ج.م</p></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-border/50 flex justify-between items-center flex-row-reverse">
                    <div className="text-right"><h3 className="text-lg font-black text-primary tracking-tight uppercase">دفتر الأستاذ الموحد</h3><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">سجل المعاملات المالي الموحد للمجموعة</p></div>
                    <div className="flex gap-3">
                        <button onClick={() => handleExport('/branches/export/all')} disabled={exporting} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-black text-xs hover:shadow-md transition-all disabled:opacity-50"><FileSpreadsheet size={14} />{exporting ? 'جاري التصدير...' : 'تصدير كل الفروع'}</button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead><tr className="bg-muted/50 border-b-2 border-primary/10">
                            <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">الفرع</th>
                            <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">الإيرادات</th>
                            <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">العمليات</th>
                            <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">العملاء</th>
                            <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">الأجهزة</th>
                            <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">المخزون</th>
                        </tr></thead>
                        <tbody className="divide-y divide-border/50">
                            {data?.branchBreakdown?.map((b: any) => (
                                <tr key={b.branchId} className="group hover:bg-muted/20 transition-colors">
                                    <td className="p-4"><div className="flex items-center gap-3 flex-row-reverse"><div className="w-9 h-9 bg-muted rounded-xl flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-white transition-all"><Building size={16} /></div><div className="text-right"><p className="text-sm font-black text-primary uppercase">{b.branchName}</p><p className="text-[9px] font-bold text-muted-foreground/40 uppercase mt-0.5">#{b.branchId.slice(-5)}</p></div></div></td>
                                    <td className="p-4"><span className="text-sm font-black text-muted-foreground">{b.revenue.toLocaleString()} ج.م</span></td>
                                    <td className="p-4"><div className="flex items-center gap-2 flex-row-reverse"><div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(b.requestCount * 5, 100)}%` }}></div></div><span className="text-[10px] font-black text-muted-foreground/60">{b.requestCount}</span></div></td>
                                    <td className="p-4"><span className="text-sm font-black text-muted-foreground">{b.customerCount}</span></td>
                                    <td className="p-4"><span className="text-sm font-black text-muted-foreground">{b.machineCount}</span></td>
                                    <td className="p-4"><span className="text-sm font-black text-muted-foreground">{b.stockCount}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

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
