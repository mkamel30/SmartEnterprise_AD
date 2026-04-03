import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Activity, RefreshCw, Database, Trash2, Settings, AlertTriangle, CheckCircle, XCircle, Clock, Eye, Zap, BarChart3, ArrowUp
} from 'lucide-react';
import syncApi, { type BranchSyncStatus, type SyncLogEntry, type SyncQueueEntry, type CleanupPolicy } from '../api/syncApi';
import { useSocket } from '../context/SocketContext';

const ENTITY_LABELS: Record<string, string> = {
    payments: 'المدفوعات',
    sales: 'المبيعات',
    machineSales: 'مبيعات الأجهزة',
    maintenanceRequests: 'طلبات الصيانة',
    stockMovements: 'حركات المخزون',
    installments: 'الأقساط',
    simMovements: 'حركات الشرائح',
    customers: 'العملاء',
    posMachines: 'نقاط البيع',
    warehouseMachines: 'أجهزة المخزن',
    warehouseSims: 'شرائح المخزن',
    simCards: 'الشرائح',
    inventory: 'المخزون',
    users: 'المستخدمين'
};

const STATUS_COLORS: Record<string, string> = {
    SUCCESS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    FAILED: 'bg-red-50 text-red-700 border-red-200',
    PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
    PENDING: 'bg-blue-50 text-blue-700 border-blue-200',
    SYNCED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ONLINE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    OFFLINE: 'bg-slate-50 text-slate-500 border-slate-200',
    CLEANED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    DISABLED: 'bg-slate-50 text-slate-400 border-slate-200',
    CONNECT: 'bg-blue-50 text-blue-700 border-blue-200',
    DISCONNECT: 'bg-slate-50 text-slate-500 border-slate-200',
    PUSH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PULL: 'bg-violet-50 text-violet-700 border-violet-200',
    CLEANUP: 'bg-indigo-50 text-indigo-700 border-indigo-200'
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
    SUCCESS: <CheckCircle className="w-3.5 h-3.5" />,
    FAILED: <XCircle className="w-3.5 h-3.5" />,
    PARTIAL: <AlertTriangle className="w-3.5 h-3.5" />,
    PENDING: <Clock className="w-3.5 h-3.5" />,
    ONLINE: <CheckCircle className="w-3.5 h-3.5" />,
    OFFLINE: <XCircle className="w-3.5 h-3.5" />,
    CLEANED: <Trash2 className="w-3.5 h-3.5" />
};

function formatTimeAgo(date: string | null): string {
    if (!date) return 'لم يتم أبداً';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'الآن';
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم`;
}

function StatusBadge({ status }: { status: string }) {
    const colorClass = STATUS_COLORS[status] || 'bg-slate-50 text-slate-600 border-slate-200';
    const icon = STATUS_ICONS[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${colorClass}`}>
            {icon}
            {status}
        </span>
    );
}

export default function SyncMonitoring() {
    const [activeTab, setActiveTab] = useState('status');
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
    const [liveEvents, setLiveEvents] = useState<any[]>([]);
    const [logFilters, setLogFilters] = useState({ type: '', status: '', branchId: '', startDate: '', endDate: '' });
    const [logPage, setLogPage] = useState(1);
    const [cleanupEditing, setCleanupEditing] = useState<string | null>(null);
    const [cleanupEditValue, setCleanupEditValue] = useState('');
    const { socket } = useSocket();
    const queryClient = useQueryClient();

    const { data: syncStatus } = useQuery({
        queryKey: ['sync-status'],
        queryFn: syncApi.getSyncStatus,
        refetchInterval: 15000
    });

    const { data: branchDetail } = useQuery({
        queryKey: ['sync-branch-detail', selectedBranch],
        queryFn: () => selectedBranch ? syncApi.getBranchSyncStatus(selectedBranch) : null,
        enabled: !!selectedBranch
    });

    const { data: logs } = useQuery({
        queryKey: ['sync-logs', logFilters, logPage],
        queryFn: () => syncApi.getSyncLogs({ ...logFilters, limit: 50, offset: (logPage - 1) * 50 }),
        refetchInterval: 30000
    });

    const { data: queue } = useQuery({
        queryKey: ['sync-queue'],
        queryFn: () => syncApi.getSyncQueue({ status: 'PENDING' }),
        refetchInterval: 15000
    });

    const { data: cleanupPolicy } = useQuery({
        queryKey: ['cleanup-policy'],
        queryFn: syncApi.getCleanupPolicy,
        refetchInterval: 60000
    });

    const runCleanup = useMutation({
        mutationFn: syncApi.runCleanup,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cleanup-policy'] });
        }
    });

    const updatePolicy = useMutation({
        mutationFn: ({ entityType, data }: { entityType: string; data: { retentionDays?: number; enabled?: boolean } }) =>
            syncApi.updateCleanupPolicy(entityType, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cleanup-policy'] });
            setCleanupEditing(null);
        }
    });

    const requestFullSync = useMutation({
        mutationFn: syncApi.requestFullSync,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sync-status'] });
        }
    });

    const requestReportSync = useMutation({
        mutationFn: syncApi.requestReportSync,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sync-status'] });
        }
    });

    useEffect(() => {
        if (!socket) return;

        const handleEvent = (eventType: string, data: any) => {
            setLiveEvents(prev => [{
                type: eventType,
                branchCode: data?.branchCode || data?.branch?.code || '',
                message: data?.message || JSON.stringify(data).substring(0, 100),
                timestamp: new Date().toISOString(),
                status: data?.status || ''
            }, ...prev].slice(0, 200));
        };

        socket.on('branch_report_push', (data) => handleEvent('REPORT_PUSH', data));
        socket.on('branch_data_push', (data) => handleEvent('DATA_PUSH', data));
        socket.on('branch_inventory_push', (data) => handleEvent('INVENTORY_PUSH', data));
        socket.on('branch_user_update', (data) => handleEvent('USER_UPDATE', data));
        socket.on('sync_ack', (data) => handleEvent('SYNC_ACK', data));
        socket.on('branch_identify', (data) => handleEvent('IDENTIFY', data));
        socket.on('disconnect', () => {
            setLiveEvents(prev => [{ type: 'SYSTEM', message: 'Socket disconnected', timestamp: new Date().toISOString() }, ...prev].slice(0, 200));
        });
        socket.on('connect', () => {
            setLiveEvents(prev => [{ type: 'SYSTEM', message: 'Socket connected', timestamp: new Date().toISOString() }, ...prev].slice(0, 200));
        });

        return () => {
            socket.off('branch_report_push');
            socket.off('branch_data_push');
            socket.off('branch_inventory_push');
            socket.off('branch_user_update');
            socket.off('sync_ack');
            socket.off('branch_identify');
            socket.off('disconnect');
            socket.off('connect');
        };
    }, [socket]);

    const tabs = [
        { id: 'status', label: 'حالة المزامنة', icon: Activity },
        { id: 'logs', label: 'سجل المزامنة', icon: BarChart3 },
        { id: 'queue', label: 'قائمة الانتظار', icon: Clock },
        { id: 'cleanup', label: 'التنظيف التلقائي', icon: Trash2 },
        { id: 'live', label: 'البث المباشر', icon: Zap }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900">مراقبة المزامنة</h1>
                        <p className="text-sm text-slate-500 mt-1">تتبع حالة المزامنة بين الفروع واللوحة المركزية</p>
                    </div>
                    <button
                        onClick={() => queryClient.invalidateQueries({ queryKey: ['sync-status'] })}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        تحديث
                    </button>
                </div>

                <div className="flex gap-1 bg-white p-1 rounded-2xl border border-slate-200 mb-6 overflow-x-auto">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                                    activeTab === tab.id
                                        ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {activeTab === 'status' && (
                    <div className="space-y-4">
                        {selectedBranch && branchDetail && (
                            <div className="bg-white rounded-2xl border border-slate-200 p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setSelectedBranch(null)} className="text-slate-400 hover:text-slate-600">
                                            <ArrowUp className="w-4 h-4" />
                                        </button>
                                        <h2 className="text-lg font-black text-slate-900">{branchDetail.branch.name}</h2>
                                        <StatusBadge status={branchDetail.branch.status} />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => requestFullSync.mutate(selectedBranch)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            مزامنة كاملة
                                        </button>
                                        <button
                                            onClick={() => requestReportSync.mutate(selectedBranch)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100"
                                        >
                                            <Database className="w-3.5 h-3.5" />
                                            مزامنة التقارير
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {Object.entries(branchDetail.entitySync).map(([entityType, data]: [string, any]) => (
                                        <div key={entityType} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                            <div className="text-xs font-bold text-slate-500 mb-1">{ENTITY_LABELS[entityType] || entityType}</div>
                                            <div className="flex items-center justify-between">
                                                <StatusBadge status={data.status} />
                                                <span className="text-xs text-slate-400">{formatTimeAgo(data.lastSyncedAt)}</span>
                                            </div>
                                            <div className="text-xs text-slate-400 mt-1">{data.recordCount} عنصر</div>
                                            {data.errorMessage && (
                                                <div className="text-xs text-red-500 mt-1 truncate" title={data.errorMessage}>{data.errorMessage}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {branchDetail.recentLogs.length > 0 && (
                                    <div className="mt-4">
                                        <h3 className="text-sm font-bold text-slate-700 mb-2">آخر الأحداث</h3>
                                        <div className="space-y-1">
                                            {branchDetail.recentLogs.slice(0, 5).map((log: SyncLogEntry) => (
                                                <div key={log.id} className="flex items-center gap-2 text-xs text-slate-500 py-1">
                                                    <StatusBadge status={log.status} />
                                                    <span className="font-bold">{log.type}</span>
                                                    <span className="truncate flex-1">{log.message}</span>
                                                    <span className="text-slate-400">{formatTimeAgo(log.createdAt)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {!selectedBranch && syncStatus?.branches && (
                            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                <table className="w-full">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="text-right px-4 py-3 text-xs font-black text-slate-500">الفرع</th>
                                            <th className="text-right px-4 py-3 text-xs font-black text-slate-500">الحالة</th>
                                            <th className="text-right px-4 py-3 text-xs font-black text-slate-500">آخر ظهور</th>
                                            <th className="text-right px-4 py-3 text-xs font-black text-slate-500">المزامنة</th>
                                            <th className="text-right px-4 py-3 text-xs font-black text-slate-500">إجراء</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {syncStatus.branches.map((branch: BranchSyncStatus) => {
                                            const entityCount = Object.keys(branch.entitySync).length;
                                            const successCount = Object.values(branch.entitySync).filter((e: any) => e.status === 'SUCCESS').length;
                                            const failedCount = Object.values(branch.entitySync).filter((e: any) => e.status === 'FAILED').length;
                                            return (
                                                <tr key={branch.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="font-bold text-slate-900">{branch.name}</div>
                                                        <div className="text-xs text-slate-400">{branch.code}</div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <StatusBadge status={branch.status} />
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-slate-500">
                                                        {formatTimeAgo(branch.lastSeen)}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-emerald-600">{successCount}</span>
                                                            {failedCount > 0 && <span className="text-xs font-bold text-red-600">{failedCount}</span>}
                                                            <span className="text-xs text-slate-400">{entityCount} أنواع</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <button
                                                            onClick={() => setSelectedBranch(branch.id)}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200"
                                                        >
                                                            <Eye className="w-3.5 h-3.5" />
                                                            عرض التفاصيل
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'logs' && (
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200 p-4">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <select
                                    value={logFilters.type}
                                    onChange={e => setLogFilters(prev => ({ ...prev, type: e.target.value }))}
                                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                                >
                                    <option value="">كل الأنواع</option>
                                    <option value="PUSH">PUSH</option>
                                    <option value="PULL">PULL</option>
                                    <option value="CONNECT">CONNECT</option>
                                    <option value="DISCONNECT">DISCONNECT</option>
                                    <option value="CLEANUP">CLEANUP</option>
                                </select>
                                <select
                                    value={logFilters.status}
                                    onChange={e => setLogFilters(prev => ({ ...prev, status: e.target.value }))}
                                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                                >
                                    <option value="">كل الحالات</option>
                                    <option value="SUCCESS">SUCCESS</option>
                                    <option value="FAILED">FAILED</option>
                                    <option value="PARTIAL">PARTIAL</option>
                                </select>
                                <input
                                    type="date"
                                    value={logFilters.startDate}
                                    onChange={e => setLogFilters(prev => ({ ...prev, startDate: e.target.value }))}
                                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
                                />
                                <input
                                    type="date"
                                    value={logFilters.endDate}
                                    onChange={e => setLogFilters(prev => ({ ...prev, endDate: e.target.value }))}
                                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
                                />
                                <button
                                    onClick={() => setLogFilters({ type: '', status: '', branchId: '', startDate: '', endDate: '' })}
                                    className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200"
                                >
                                    مسح الفلاتر
                                </button>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="text-right px-4 py-3 text-xs font-black text-slate-500">الوقت</th>
                                        <th className="text-right px-4 py-3 text-xs font-black text-slate-500">الفرع</th>
                                        <th className="text-right px-4 py-3 text-xs font-black text-slate-500">النوع</th>
                                        <th className="text-right px-4 py-3 text-xs font-black text-slate-500">الحالة</th>
                                        <th className="text-right px-4 py-3 text-xs font-black text-slate-500">الرسالة</th>
                                        <th className="text-right px-4 py-3 text-xs font-black text-slate-500">العدد</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {logs?.data.map((log: SyncLogEntry) => (
                                        <tr key={log.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                                                {new Date(log.createdAt).toLocaleString('ar-EG')}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-bold text-slate-700">
                                                {log.branch?.name || log.branchCode || '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{log.type}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusBadge status={log.status} />
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-600 max-w-md truncate">{log.message}</td>
                                            <td className="px-4 py-3 text-sm font-bold text-slate-700">{log.itemCount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {logs?.pagination && logs.pagination.pages > 1 && (
                                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
                                    <span className="text-xs text-slate-500">
                                        {logs.pagination.total} سجل - صفحة {logPage} من {logs.pagination.pages}
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setLogPage(p => Math.max(1, p - 1))}
                                            disabled={logPage === 1}
                                            className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-50"
                                        >
                                            السابق
                                        </button>
                                        <button
                                            onClick={() => setLogPage(p => Math.min(logs.pagination.pages, p + 1))}
                                            disabled={logPage >= logs.pagination.pages}
                                            className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-50"
                                        >
                                            التالي
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'queue' && (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        {queue?.queue.length === 0 ? (
                            <div className="p-12 text-center">
                                <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                <p className="text-slate-500 font-bold">قائمة الانتظار فارغة</p>
                                <p className="text-xs text-slate-400 mt-1">لا توجد تحديثات معلقة</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="text-right px-4 py-3 text-xs font-black text-slate-500">الفرع</th>
                                        <th className="text-right px-4 py-3 text-xs font-black text-slate-500">النوع</th>
                                        <th className="text-right px-4 py-3 text-xs font-black text-slate-500">الإجراء</th>
                                        <th className="text-right px-4 py-3 text-xs font-black text-slate-500">الحالة</th>
                                        <th className="text-right px-4 py-3 text-xs font-black text-slate-500">الوقت</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {queue?.queue.map((item: SyncQueueEntry) => (
                                        <tr key={item.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 text-sm font-bold text-slate-700">
                                                {item.branch?.name || item.branchId}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-600">{item.entityType}</td>
                                            <td className="px-4 py-3 text-xs text-slate-600">{item.action}</td>
                                            <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                                            <td className="px-4 py-3 text-xs text-slate-500">{formatTimeAgo(item.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {activeTab === 'cleanup' && (
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200 p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-lg font-black text-slate-900">سياسة التنظيف التلقائي</h2>
                                    <p className="text-xs text-slate-500 mt-1">يتم التشغيل يومياً الساعة 3:00 صباحاً</p>
                                </div>
                                <button
                                    onClick={() => runCleanup.mutate()}
                                    disabled={runCleanup.isPending}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-xl text-sm font-bold hover:bg-red-100 disabled:opacity-50"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    {runCleanup.isPending ? 'جاري التنظيف...' : 'تشغيل الآن'}
                                </button>
                            </div>
                            <div className="space-y-3">
                                {cleanupPolicy?.policy.map((policy: CleanupPolicy) => (
                                    <div key={policy.entityType} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                        <div>
                                            <div className="text-sm font-bold text-slate-700">{ENTITY_LABELS[policy.entityType] || policy.entityType}</div>
                                            <div className="text-xs text-slate-400">{policy.description}</div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {cleanupEditing === policy.entityType ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={cleanupEditValue}
                                                        onChange={e => setCleanupEditValue(e.target.value)}
                                                        className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm text-center"
                                                    />
                                                    <span className="text-xs text-slate-500">يوم</span>
                                                    <button
                                                        onClick={() => updatePolicy.mutate({ entityType: policy.entityType, data: { retentionDays: parseInt(cleanupEditValue) } })}
                                                        className="px-2 py-1 bg-emerald-500 text-white rounded-lg text-xs font-bold"
                                                    >
                                                        حفظ
                                                    </button>
                                                    <button
                                                        onClick={() => setCleanupEditing(null)}
                                                        className="px-2 py-1 bg-slate-200 text-slate-600 rounded-lg text-xs font-bold"
                                                    >
                                                        إلغاء
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-black text-slate-900">{policy.retentionDays} يوم</span>
                                                    <button
                                                        onClick={() => { setCleanupEditing(policy.entityType); setCleanupEditValue(String(policy.retentionDays)); }}
                                                        className="p-1 text-slate-400 hover:text-slate-600"
                                                    >
                                                        <Settings className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                            <label className="flex items-center gap-1.5 text-xs text-slate-500">
                                                <input
                                                    type="checkbox"
                                                    checked={policy.enabled}
                                                    onChange={e => updatePolicy.mutate({ entityType: policy.entityType, data: { enabled: e.target.checked } })}
                                                    className="rounded border-slate-300"
                                                />
                                                مفعل
                                            </label>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'live' && (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-sm font-bold text-slate-700">البث المباشر</span>
                            </div>
                            <button
                                onClick={() => setLiveEvents([])}
                                className="text-xs text-slate-400 hover:text-slate-600 font-bold"
                            >
                                مسح
                            </button>
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                            {liveEvents.length === 0 ? (
                                <div className="p-12 text-center">
                                    <Zap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                    <p className="text-slate-500 font-bold">في انتظار الأحداث</p>
                                    <p className="text-xs text-slate-400 mt-1">سيتم عرض الأحداث فور وصولها</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {liveEvents.map((event, i) => (
                                        <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                                            <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
                                                {new Date(event.timestamp).toLocaleTimeString('ar-EG')}
                                            </span>
                                            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded whitespace-nowrap">
                                                {event.type}
                                            </span>
                                            {event.branchCode && (
                                                <span className="text-xs font-bold text-blue-600">{event.branchCode}</span>
                                            )}
                                            <span className="text-xs text-slate-600 truncate flex-1">{event.message}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
