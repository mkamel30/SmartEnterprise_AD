import { useState, useEffect } from 'react';
import adminClient from '../api/adminClient';
import { Plus, RefreshCw, Building2, Key, Edit2, Trash2, Check, Copy, Shield, Store, Briefcase, MapPin, Hash, Search, Filter, Users, Package, Download, AlertCircle, CheckCircle, Clock, RefreshCw as SyncIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import { BranchInventoryModal } from '../components/BranchInventoryModal';

type BranchType = 'BRANCH' | 'MAIN_STORE' | 'MAINTENANCE_CENTER' | 'ADMIN_AFFAIRS';

const TYPE_CONFIG: Record<BranchType, { label: string; color: string; icon: any }> = {
  BRANCH: { label: 'فرع تشغيلي', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Building2 },
  MAIN_STORE: { label: 'المخزن الرئيسي', color: 'bg-primary/10 text-primary border-primary/20', icon: Briefcase },
  MAINTENANCE_CENTER: { label: 'مركز الصيانة المركزية', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Store },
  ADMIN_AFFAIRS: { label: 'الشئون الإدارية (HQ)', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Shield },
};

export default function Branches() {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<Record<string, any>>({});
  const [pushingUpdate, setPushingUpdate] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [inventoryBranch, setInventoryBranch] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    phone: '',
    type: 'BRANCH' as BranchType,
    managerEmail: '',
    maintenanceCenterId: '',
    parentBranchId: '',
    authorizedHWID: ''
  });

  useEffect(() => { fetchBranches(); }, []);

  const fetchBranches = async () => {
    try {
      setLoading(true);
      const [branchesRes, versionsRes] = await Promise.all([
        adminClient.get('/branches'),
        adminClient.get('/versions').catch(() => ({ data: { branches: [] } }))
      ]);
      setBranches(branchesRes.data);
      const versionMap: Record<string, any> = {};
      (versionsRes.data.branches || []).forEach((v: any) => { versionMap[v.branchCode] = v; });
      setVersions(versionMap);
    } catch {
      toast.error('فشل في جلب بيانات الفروع');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckUpdate = async (branchCode: string) => {
    setCheckingUpdate(branchCode);
    try {
      await adminClient.post(`/versions/${branchCode}/check`);
      toast.success('تم التحقق من الإصدار بنجاح');
      fetchBranches();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'فشل في التحقق من الإصدار');
    } finally {
      setCheckingUpdate(null);
    }
  };

  const handlePushUpdate = async (branchCode: string) => {
    if (!window.confirm('هل أنت متأكد من إرسال تحديث لهذا الفرع؟')) return;
    setPushingUpdate(branchCode);
    try {
      await adminClient.post(`/versions/${branchCode}/push`);
      toast.success('تم إرسال طلب التحديث بنجاح');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'فشل في إرسال التحديث');
    } finally {
      setPushingUpdate(null);
    }
  };

  const getVersionBadge = (branchCode: string) => {
    const v = versions[branchCode];
    if (!v) return null;
    const status = v.updateStatus;
    if (status === 'up_to_date') return { color: 'bg-success/10 text-success', icon: CheckCircle, label: `v${v.appVersion}` };
    if (status === 'update_available') return { color: 'bg-amber-100 text-amber-700', icon: AlertCircle, label: `v${v.appVersion} متاح` };
    if (status === 'updating') return { color: 'bg-blue-100 text-blue-700', icon: Clock, label: 'جاري التحديث' };
    if (status === 'failed') return { color: 'bg-red-100 text-red-700', icon: AlertCircle, label: 'فشل' };
    return { color: 'bg-slate-100 text-slate-400', icon: AlertCircle, label: v.appVersion || 'غير معروف' };
  };

  const handleOpenModal = (branch: any = null) => {
    if (branch) {
      setEditingBranch(branch);
      setFormData({
        name: branch.name,
        code: branch.code || '',
        address: branch.address || '',
        phone: branch.phone || '',
        type: branch.type || 'BRANCH',
        managerEmail: branch.managerEmail || '',
        maintenanceCenterId: branch.maintenanceCenterId || '',
        parentBranchId: branch.parentBranchId || '',
        authorizedHWID: branch.authorizedHWID || ''
      });
    } else {
      setEditingBranch(null);
      setFormData({ name: '', code: '', address: '', phone: '', type: 'BRANCH', managerEmail: '', maintenanceCenterId: '', parentBranchId: '', authorizedHWID: '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBranch) {
        await adminClient.put(`/branches/${editingBranch.id}`, formData);
        toast.success('تم تحديث بيانات الفرع بنجاح');
      } else {
        const res = await adminClient.post('/branches', formData);
        toast.success(`تم تسجيل الفرع الجديد بنجاح${res.data?.code ? ` — الكود: ${res.data.code}` : ''}`);
      }
      setIsModalOpen(false);
      fetchBranches();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'فشل في حفظ بيانات الفرع');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الفرع؟ سيتم حذف كافة البيانات المرتبطة به.')) return;
    try {
      await adminClient.delete(`/branches/${id}`);
      toast.success('تم حذف الفرع');
      fetchBranches();
    } catch {
      toast.error('فشل في حذف الفرع');
    }
  };

  const handleRequestSync = async (id: string) => {
    try {
      await adminClient.post(`/sync/request-full-sync/${id}`);
      toast.success('تم إرسال طلب مزامنة كاملة للفرع بنجاح');
    } catch {
      toast.error('فشل في إرسال طلب المزامنة');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('تم نسخ مفتاح API');
  };

  const filtered = branches.filter((b: any) => {
    const matchSearch = !searchTerm ||
      b.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.code?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = !typeFilter || b.type === typeFilter;
    return matchSearch && matchType;
  });

  const hqBranches = filtered.filter((b: any) => ['ADMIN_AFFAIRS', 'MAINTENANCE_CENTER', 'MAIN_STORE'].includes(b.type));
  const operationalBranches = filtered.filter((b: any) => b.type === 'BRANCH');

  const getTypeIcon = (type: string) => {
    const Icon = TYPE_CONFIG[type as BranchType]?.icon || Building2;
    return <Icon size={20} />;
  };

  return (
    <div className="space-y-8 animate-fade-in font-arabic" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-brand-primary flex items-center gap-3">
            <Building2 size={28} className="text-brand-primary" />
            إدارة الفروع
          </h1>
          <p className="text-muted-foreground text-sm mt-1">إضافة وتعديل بيانات الفروع والمخازن ومراكز الصيانة</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchBranches} className="h-12 w-12 flex items-center justify-center bg-white border-2 border-slate-100 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
            <RefreshCw size={18} className={loading ? 'animate-spin text-brand-primary' : 'text-slate-400'} />
          </button>
          <button onClick={() => handleOpenModal()} className="h-12 bg-brand-primary text-white flex items-center justify-center gap-2 px-6 rounded-xl shadow-lg shadow-brand-primary/20 hover:bg-brand-blue active:scale-95 transition-all text-sm font-bold">
            <Plus size={18} />
            إضافة فرع
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-white rounded-2xl border-2 border-primary/10 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="بحث بالاسم أو الكود..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border-2 border-primary/10 rounded-lg px-10 py-2.5 text-sm font-bold focus:ring-2 focus:ring-primary focus:border-primary transition-all" />
          </div>
          <div className="relative w-full sm:w-56">
            <Filter size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full border-2 border-primary/10 rounded-lg px-9 py-2.5 text-sm font-bold appearance-none focus:ring-2 focus:ring-primary focus:border-primary transition-all bg-white">
              <option value="">كل الأنواع</option>
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* HQ / Administrative Entities */}
      {hqBranches.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-1.5 h-6 bg-purple-600 rounded-full" />
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-wider">الكيانات المركزية</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {hqBranches.map((branch: any) => {
              const cfg = TYPE_CONFIG[branch.type as BranchType] || TYPE_CONFIG.BRANCH;
              return (
                <div key={branch.id} className="bg-white rounded-2xl border-2 border-slate-100 shadow-sm hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 transition-all group">
                  <div className={`h-2 w-full rounded-t-2xl ${branch.status === 'ONLINE' ? 'bg-success' : 'bg-slate-200'}`}></div>
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${cfg.color.replace('text-', 'bg-').replace('700', '50')} group-hover:scale-110 transition-all`}>
                        {getTypeIcon(branch.type)}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setInventoryBranch(branch)} className="p-2 text-slate-400 hover:text-primary transition-colors" title="جرد"><Package size={14} /></button>
                        <button onClick={() => handleRequestSync(branch.id)} className="p-2 text-slate-400 hover:text-success transition-colors" title="مزامنة"><RefreshCw size={14} /></button>
                        <button onClick={() => handleOpenModal(branch)} className="p-2 text-slate-400 hover:text-brand-primary transition-colors" title="تعديل"><Edit2 size={14} /></button>
                        <button onClick={() => handleDelete(branch.id)} className="p-2 text-slate-400 hover:text-red-600 transition-colors" title="حذف"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <h3 className="font-black text-slate-800 text-lg mb-1">{branch.name}</h3>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${cfg.color}`}>{cfg.label}</span>
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold"><Hash size={14} /><span className="font-mono">{branch.code}</span></div>
                      {branch.address && <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold truncate"><MapPin size={14} /><span>{branch.address}</span></div>}
                      {branch.managerEmail && <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold truncate"><Users size={14} /><span>{branch.managerEmail}</span></div>}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${branch.status === 'ONLINE' ? 'bg-success/10 text-success' : 'bg-slate-100 text-slate-400'}`}>
                        {branch.status === 'ONLINE' ? 'متصل' : 'غير متصل'}
                      </span>
                      {branch.apiKey && (
                        <button onClick={() => copyToClipboard(branch.apiKey)} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-brand-primary transition-colors">
                          <Copy size={12} /> نسخ API Key
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Operational Branches Table */}
      {operationalBranches.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-wider">الفروع التشغيلية</h2>
          </div>
          <div className="bg-white rounded-2xl border-2 border-slate-100 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-slate-50/50">
                  <tr className="border-b border-slate-100">
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">الفرع</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">الكود</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">الحالة</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">الإصدار</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">آخر اتصال</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {operationalBranches.map((branch: any) => (
                    <tr key={branch.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
                            <Building2 size={18} />
                          </div>
                          <div>
                            <span className="font-black text-slate-800">{branch.name}</span>
                            {branch.address && <p className="text-[10px] text-slate-400 font-bold mt-0.5">{branch.address}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="p-4"><span className="font-mono text-sm font-black text-slate-500">{branch.code}</span></td>
                      <td className="p-4">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${branch.status === 'ONLINE' ? 'bg-success/10 text-success' : 'bg-slate-100 text-slate-400'}`}>
                          {branch.status === 'ONLINE' ? 'متصل' : 'غير متصل'}
                        </span>
                      </td>
                      <td className="p-4">
                        {(() => {
                          const badge = getVersionBadge(branch.code);
                          if (!badge) {
                            return (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-slate-300">—</span>
                                <button
                                  onClick={() => handleCheckUpdate(branch.code)}
                                  disabled={checkingUpdate === branch.code}
                                  className="p-1.5 text-slate-300 hover:text-brand-primary disabled:opacity-50 rounded transition-all"
                                  title="فحص الإصدار"
                                >
                                  <SyncIcon size={12} className={checkingUpdate === branch.code ? 'animate-spin' : ''} />
                                </button>
                              </div>
                            );
                          }
                          const Icon = badge.icon;
                          return (
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 ${badge.color}`}>
                                <Icon size={10} />
                                {badge.label}
                              </span>
                              <button
                                onClick={() => handleCheckUpdate(branch.code)}
                                disabled={checkingUpdate === branch.code}
                                className="p-1.5 text-slate-400 hover:text-brand-primary disabled:opacity-50 rounded transition-all"
                                title="فحص الإصدار"
                              >
                                <SyncIcon size={12} className={checkingUpdate === branch.code ? 'animate-spin' : ''} />
                              </button>
                              <button
                                onClick={() => handlePushUpdate(branch.code)}
                                disabled={pushingUpdate === branch.code}
                                className="p-1.5 text-slate-400 hover:text-success disabled:opacity-50 rounded transition-all"
                                title="إرسال تحديث"
                              >
                                <Download size={12} className={pushingUpdate === branch.code ? 'animate-pulse' : ''} />
                              </button>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-4 text-[10px] text-slate-400 font-bold">
                        {branch.lastSeen ? new Date(branch.lastSeen).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setInventoryBranch(branch)} className="p-2 text-slate-400 hover:text-primary rounded-lg transition-all" title="جرد"><Package size={14} /></button>
                          <button onClick={() => handleRequestSync(branch.id)} className="p-2 text-slate-400 hover:text-success rounded-lg transition-all" title="مزامنة"><RefreshCw size={14} /></button>
                          <button onClick={() => handleOpenModal(branch)} className="p-2 text-slate-400 hover:text-brand-primary rounded-lg transition-all" title="تعديل"><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(branch.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg transition-all" title="حذف"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {filtered.length === 0 && !loading && (
        <div className="bg-white rounded-2xl border-2 border-slate-100 p-16 text-center">
          <Building2 size={48} className="mx-auto mb-4 text-slate-200" />
          <h3 className="font-black text-slate-400 text-lg">لا توجد فروع</h3>
          <p className="text-sm text-slate-300 mt-1 font-bold">
            {searchTerm || typeFilter ? 'لا توجد نتائج للبحث' : 'قم بإضافة أول فرع'}
          </p>
        </div>
      )}

      {/* Branch Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBranch ? 'تعديل الفرع' : 'إضافة فرع جديد'}
        subtitle="بيانات بنية تحتية للمجموعة"
        icon={<Building2 size={36} className="text-brand-primary" />}
      >
        <form onSubmit={handleSave} className="space-y-5 w-full">
          {/* Name + Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-primary/60 uppercase tracking-widest mr-4">اسم الفرع</label>
              <input type="text" required value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="smart-input h-12 px-5 text-brand-primary font-bold text-right text-sm"
                placeholder="مثال: الفرع الرئيسي" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-primary/60 uppercase tracking-widest mr-4">الكود</label>
              <input type="text" value={formData.code}
                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="smart-input h-12 px-5 text-brand-primary font-bold text-left font-mono"
                placeholder="BR001" />
            </div>
          </div>

          {/* Type */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-brand-primary/60 uppercase tracking-widest mr-4">نوع الكيان</label>
            <select value={formData.type}
              onChange={e => setFormData({ ...formData, type: e.target.value as BranchType })}
              className="smart-input h-12 px-5 text-brand-primary font-bold text-right text-sm appearance-none">
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
            </select>
          </div>

          {/* Address + Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-primary/60 uppercase tracking-widest mr-4">العنوان</label>
              <input type="text" value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                className="smart-input h-12 px-5 text-brand-primary font-bold text-right text-sm"
                placeholder="المدينة" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-primary/60 uppercase tracking-widest mr-4">الهاتف</label>
              <input type="text" value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="smart-input h-12 px-5 text-brand-primary font-bold text-right text-sm"
                placeholder="01123456789" />
            </div>
          </div>

          {/* Manager Email */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-brand-primary/60 uppercase tracking-widest mr-4">البريد الإلكتروني للمدير</label>
            <input type="email" value={formData.managerEmail}
              onChange={e => setFormData({ ...formData, managerEmail: e.target.value })}
              className="smart-input h-12 px-5 text-brand-primary font-bold text-right text-sm"
              placeholder="manager@example.com" />
          </div>

          {/* Parent Branch + Maintenance Center */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-primary/60 uppercase tracking-widest mr-4">الفرع الرئيسي (التابع له)</label>
              <select value={formData.parentBranchId}
                onChange={e => setFormData({ ...formData, parentBranchId: e.target.value })}
                className="smart-input h-12 px-5 text-brand-primary font-bold text-right text-sm appearance-none">
                <option value="">بدون</option>
                {branches.filter(b => b.id !== editingBranch?.id).map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-primary/60 uppercase tracking-widest mr-4">مركز الصيانة</label>
              <select value={formData.maintenanceCenterId}
                onChange={e => setFormData({ ...formData, maintenanceCenterId: e.target.value })}
                className="smart-input h-12 px-5 text-brand-primary font-bold text-right text-sm appearance-none">
                <option value="">بدون</option>
                {branches.filter(b => b.type === 'MAINTENANCE_CENTER').map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* HWID */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-brand-primary/60 uppercase tracking-widest mr-4 flex justify-between flex-row-reverse">
              <span>HWID المعتمد</span>
              <span className="text-brand-cyan lowercase normal-case opacity-60">أمان إضافي</span>
            </label>
            <input type="text" value={formData.authorizedHWID}
              onChange={e => setFormData({ ...formData, authorizedHWID: e.target.value })}
              className="smart-input h-12 px-5 text-brand-primary font-bold text-left font-mono"
              placeholder="Hardware binding string" dir="ltr" />
          </div>

          {/* API Key (only when editing) */}
          {editingBranch?.apiKey && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-primary/60 uppercase tracking-widest mr-4">مفتاح API</label>
              <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
                <Key size={14} className="text-brand-cyan shrink-0" />
                <code className="text-[10px] font-black text-brand-primary/60 truncate flex-1 text-left font-mono" dir="ltr">{editingBranch.apiKey}</code>
                <button type="button" onClick={() => copyToClipboard(editingBranch.apiKey)} className="text-brand-cyan hover:text-brand-primary transition-colors shrink-0">
                  <Copy size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="pt-6 flex flex-col sm:flex-row-reverse gap-4">
            <button type="submit" className="flex-[2] h-12 bg-brand-primary text-white flex items-center justify-center gap-2 font-bold rounded-xl shadow-lg shadow-brand-primary/20 hover:bg-brand-blue active:scale-95 transition-all text-sm">
              <Check size={16} />
              {editingBranch ? 'تحديث البيانات' : 'تسجيل الفرع'}
            </button>
            <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 h-12 flex items-center justify-center font-bold text-slate-400 rounded-xl hover:bg-slate-50 transition-colors text-sm">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* Branch Inventory Modal */}
      {inventoryBranch && (
        <BranchInventoryModal
          branchId={inventoryBranch.id}
          branchCode={inventoryBranch.code}
          branchName={inventoryBranch.name}
          onClose={() => setInventoryBranch(null)}
        />
      )}
    </div>
  );
}
