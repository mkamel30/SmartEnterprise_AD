import { useState, useEffect } from 'react';
import adminClient from '../api/adminClient';
import { RefreshCw, Download, Upload, RotateCcw, Search, Filter, CheckCircle, XCircle, Clock, AlertTriangle, Package } from 'lucide-react';

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  check: { label: 'فحص', color: 'bg-blue-50 text-blue-600 border-blue-100', icon: Search },
  download: { label: 'تحميل', color: 'bg-purple-50 text-purple-600 border-purple-100', icon: Download },
  apply: { label: 'تطبيق', color: 'bg-success/50 text-success border-success/100', icon: Upload },
  force_push: { label: 'تحديث إجباري', color: 'bg-amber-50 text-amber-600 border-amber-100', icon: AlertTriangle },
  rollback: { label: 'استرجاع', color: 'bg-red-50 text-red-600 border-red-100', icon: RotateCcw },
  verify_backup: { label: 'تحقق من النسخة', color: 'bg-cyan-50 text-cyan-600 border-cyan-100', icon: CheckCircle },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  success: { label: 'نجاح', color: 'bg-success/10 text-success border-success/20', icon: CheckCircle },
  failed: { label: 'فشل', color: 'bg-red-50 text-red-600 border-red-200', icon: XCircle },
  in_progress: { label: 'قيد التنفيذ', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: Clock },
  downloading: { label: 'جاري التحميل', color: 'bg-purple-50 text-purple-600 border-purple-200', icon: Download },
  installing: { label: 'جاري التثبيت', color: 'bg-amber-50 text-amber-600 border-amber-200', icon: Package },
};

export default function VersionLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => { fetchLogs(); fetchBranches(); }, [branchFilter, actionFilter, statusFilter]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (branchFilter) params.branchCode = branchFilter;
      if (actionFilter) params.action = actionFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await adminClient.get('/versions/logs', { params });
      setLogs(res.data.logs || []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await adminClient.get('/branches');
      setBranches(res.data.filter((b: any) => b.type === 'BRANCH'));
    } catch {
      setBranches([]);
    }
  };

  const filtered = logs.filter((log: any) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        log.branchCode?.toLowerCase().includes(term) ||
        log.initiatedBy?.toLowerCase().includes(term) ||
        log.errorMessage?.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const getActionBadge = (action: string) => {
    const cfg = ACTION_CONFIG[action] || { label: action, color: 'bg-slate-50 text-slate-500 border-slate-100', icon: Clock };
    const Icon = cfg.icon;
    return (
      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border flex items-center gap-1 ${cfg.color}`}>
        <Icon size={10} />
        {cfg.label}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const cfg = STATUS_CONFIG[status] || { label: status, color: 'bg-slate-50 text-slate-500 border-slate-100', icon: Clock };
    const Icon = cfg.icon;
    return (
      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border flex items-center gap-1 ${cfg.color}`}>
        <Icon size={10} />
        {cfg.label}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in font-arabic" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-brand-primary flex items-center gap-3">
            <RotateCcw size={28} className="text-brand-primary" />
            سجلات الإصدارات
          </h1>
          <p className="text-muted-foreground text-sm mt-1">تتبع عمليات التحديث والاسترجاع لكل الفروع</p>
        </div>
        <button
          onClick={fetchLogs}
          className="h-12 w-12 flex items-center justify-center bg-white border-2 border-slate-100 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin text-brand-primary' : 'text-slate-400'} />
        </button>
      </div>

      <div className="bg-white rounded-2xl border-2 border-primary/10 p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="بحث..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border-2 border-primary/10 rounded-lg px-10 py-2.5 text-sm font-bold focus:ring-2 focus:ring-primary focus:border-primary transition-all"
            />
          </div>
          <div className="relative">
            <Filter size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="w-full border-2 border-primary/10 rounded-lg px-9 py-2.5 text-sm font-bold appearance-none focus:ring-2 focus:ring-primary focus:border-primary transition-all bg-white"
            >
              <option value="">كل الفروع</option>
              {branches.map((b) => <option key={b.code} value={b.code}>{b.name} ({b.code})</option>)}
            </select>
          </div>
          <div className="relative">
            <Filter size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full border-2 border-primary/10 rounded-lg px-9 py-2.5 text-sm font-bold appearance-none focus:ring-2 focus:ring-primary focus:border-primary transition-all bg-white"
            >
              <option value="">كل الأفعال</option>
              {Object.entries(ACTION_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
            </select>
          </div>
          <div className="relative">
            <Filter size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border-2 border-primary/10 rounded-lg px-9 py-2.5 text-sm font-bold appearance-none focus:ring-2 focus:ring-primary focus:border-primary transition-all bg-white"
            >
              <option value="">كل الحالات</option>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border-2 border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50/50">
              <tr className="border-b border-slate-100">
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">#</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">الفرع</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">الفعل</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">من إصدار</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">إلى إصدار</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">الحالة</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">النتيجة</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center">
                    <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-brand-primary" />
                    <p className="text-sm text-slate-400 font-bold">جاري التحميل...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center">
                    <RotateCcw size={32} className="mx-auto mb-2 text-slate-200" />
                    <p className="text-sm text-slate-400 font-bold">لا توجد سجلات</p>
                  </td>
                </tr>
              ) : (
                filtered.map((log: any, index: number) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-[10px] text-slate-300 font-mono">{index + 1}</td>
                    <td className="p-4">
                      <span className="font-mono text-sm font-black text-brand-primary">{log.branchCode}</span>
                    </td>
                    <td className="p-4">{getActionBadge(log.action)}</td>
                    <td className="p-4">
                      <span className="text-xs font-mono text-slate-400">{log.fromVersion || '—'}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-xs font-mono font-black text-slate-600">{log.toVersion || '—'}</span>
                    </td>
                    <td className="p-4">{getStatusBadge(log.status)}</td>
                    <td className="p-4">
                      {log.errorMessage ? (
                        <span className="text-[10px] text-red-500 font-bold truncate max-w-48 block" title={log.errorMessage}>
                          {log.errorMessage}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="p-4 text-[10px] text-slate-400 font-bold whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('ar-EG', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && filtered.length > 0 && (
        <div className="text-center text-[10px] text-slate-300 font-bold">
          {filtered.length} سجل
        </div>
      )}
    </div>
  );
}