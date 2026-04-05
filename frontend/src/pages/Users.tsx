import { useState, useEffect } from 'react';
import adminClient from '../api/adminClient';
import { Search, Pencil, Key, Unlock, Trash2, Building2, ShieldCheck, RefreshCw, UserPlus, Users as UsersIcon, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';

export default function Users() {
    const [users, setUsers] = useState<any[]>([]);
    const [branches, setBranches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isIdenOpen, setIsIdenOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        displayName: '',
        password: '',
        role: 'CS_AGENT',
        branchId: '',
        isActive: true
    });
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const res = await adminClient.get('/users');
            setUsers(res.data.users || res.data);
            
            const bRes = await adminClient.get('/branches');
            setBranches(bRes.data);
        } catch (error) {
            toast.error('فشل في تحميل بيانات المستخدمين');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (isEditMode && selectedUser) {
                await adminClient.put(`/users/${selectedUser.id}`, formData);
                toast.success('تم تحديث بيانات المستخدم');
            } else {
                await adminClient.post('/users', formData);
                toast.success('تم إنشاء حساب المستخدم بنجاح');
            }
            setIsIdenOpen(false);
            fetchUsers();
            resetForm();
        } catch (error) {
            toast.error('فشل في حفظ بيانات المستخدم');
        }
    };

    const resetForm = () => {
        setFormData({
            username: '',
            email: '',
            displayName: '',
            password: '',
            role: 'CS_AGENT',
            branchId: '',
            isActive: true
        });
        setSelectedUser(null);
        setIsEditMode(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
        try {
            await adminClient.delete(`/users/${id}`);
            toast.success('تم حذف المستخدم');
            fetchUsers();
        } catch (error) {
            toast.error('فشل في حذف المستخدم');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedUserIds.length === 0) return;
        if (!confirm(`هل أنت متأكد من حذف ${selectedUserIds.length} مستخدم؟`)) return;
        try {
            await adminClient.post('/users/bulk-delete', { userIds: selectedUserIds });
            toast.success('تم حذف المستخدمين بنجاح');
            setSelectedUserIds([]);
            fetchUsers();
        } catch (error) {
            toast.error('فشل في حذف المستخدمين');
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedUserIds(filteredUsers.map(u => u.id));
        } else {
            setSelectedUserIds([]);
        }
    };

    const handleSelectUser = (id: string) => {
        setSelectedUserIds(prev => 
            prev.includes(id) ? prev.filter(userId => userId !== id) : [...prev, id]
        );
    };

    const [branchFilter, setBranchFilter] = useState('');

    const filteredUsers = Array.isArray(users) ? users.filter(u => {
        const matchSearch = !searchTerm ||
            u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.email?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchBranch = !branchFilter || u.branchId === branchFilter;
        return matchSearch && matchBranch;
    }) : [];

    const roleMap: any = {
      'SUPER_ADMIN': 'مدير عام النظام',
      'MANAGEMENT': 'إدارة عليا',
      'BRANCH_ADMIN': 'مدير فرع',
      'ACCOUNTANT': 'محاسب',
      'CS_SUPERVISOR': 'مشرف خدمة عملاء',
      'CS_AGENT': 'موظف خدمة عملاء',
      'BRANCH_TECH': 'فني فرع'
    };

    return (
        <div className="space-y-6 font-arabic" dir="rtl">
            {/* Header section */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div className="text-right">
                    <h1 className="text-xl lg:text-2xl font-black text-primary uppercase tracking-tight flex items-center gap-3">
                        <ShieldCheck className="text-brand-cyan shrink-0" size={24} />
                        إدارة المستخدمين <span className="text-brand-cyan">والصلاحيات</span>
                    </h1>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">التحكم المركزي في هويات ووصول موظفي المجموعة</p>
                </div>
                <div className="flex gap-3 w-full lg:w-auto flex-row-reverse">
                    <button 
                        onClick={fetchUsers} 
                        className="p-3 bg-white border-2 border-primary/10 text-muted-foreground hover:text-primary transition-all active:scale-90 shadow-sm shrink-0 rounded-lg"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <div className="relative flex-1">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
                        <input 
                            type="text" 
                            placeholder="بحث شامل..." 
                            className="w-full pr-10 pl-4 py-2.5 bg-white border-2 border-primary/10 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold text-sm text-right"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="relative">
                        <Building2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
                            className="border-2 border-primary/10 rounded-lg px-9 py-2.5 text-sm font-bold appearance-none focus:ring-2 focus:ring-primary focus:border-primary transition-all bg-white min-w-[120px]">
                            <option value="">كل الفروع</option>
                            {Array.isArray(branches) && branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    {selectedUserIds.length > 0 && (
                        <button 
                            onClick={handleBulkDelete}
                            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-destructive text-white rounded-lg font-black uppercase tracking-widest text-[10px] hover:shadow-md transition-all active:scale-95"
                        >
                            <Trash2 size={16} />
                            <span>حذف المحدد ({selectedUserIds.length})</span>
                        </button>
                    )}
                    <button 
                        onClick={() => { resetForm(); setIsIdenOpen(true); }}
                        className="flex items-center justify-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-black uppercase tracking-widest text-[10px] hover:shadow-md transition-all active:scale-95"
                    >
                        <UserPlus size={16} />
                        <span>إضافة مستخدم</span>
                    </button>
                </div>
            </div>

            {/* Responsive Users Table/Cards */}
            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <div className="overflow-x-auto custom-scroll">
                    <table className="w-full text-right min-w-[700px]">
                        <thead>
                            <tr className="border-b-2 border-primary/10 bg-muted/50">
                                <th className="p-4 w-12 text-center">
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary"
                                        checked={filteredUsers.length > 0 && selectedUserIds.length === filteredUsers.length}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">الهوية المؤسسية</th>
                                <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">الدور والصلاحيات</th>
                                <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">الفرع</th>
                                <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">الحالة</th>
                                <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] text-left">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={6} className="p-4"><div className="h-8 bg-muted rounded-lg w-full"></div></td>
                                    </tr>
                                ))
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center">
                                        <UsersIcon className="mx-auto mb-3 text-muted-foreground/20" size={48} />
                                        <p className="text-muted-foreground/40 font-bold uppercase tracking-widest text-sm">لا توجد هويات مطابقة للبحث</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((u) => (
                                    <tr key={u.id} className={`group hover:bg-muted/30 transition-colors ${selectedUserIds.includes(u.id) ? 'bg-primary/5' : ''}`}>
                                        <td className="p-4 text-center">
                                            <input 
                                                type="checkbox" 
                                                className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                                                checked={selectedUserIds.includes(u.id)}
                                                onChange={() => handleSelectUser(u.id)}
                                            />
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-3 flex-row-reverse">
                                                <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-white transition-all shrink-0">
                                                    <UsersIcon size={18} />
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-black text-primary group-hover:text-primary/70 transition-colors uppercase leading-tight">{u.displayName}</p>
                                                    <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mt-0.5" dir="ltr">{u.username}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex flex-col gap-1 items-start">
                                                <span className="text-[10px] font-black px-2.5 py-1 bg-primary/5 text-primary rounded-full uppercase border border-primary/10">
                                                    {roleMap[u.role] || u.role}
                                                </span>
                                                <span className="text-[10px] font-bold text-muted-foreground/60 uppercase truncate max-w-[150px] text-left" dir="ltr">{u.email}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center gap-1.5 flex-row-reverse">
                                                <Building2 className="text-muted-foreground/30" size={12} />
                                                <span className="text-xs font-black text-muted-foreground uppercase leading-none">{u.branch?.name || 'الإدارة المركزية'}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter flex-row-reverse ${u.isActive ? 'bg-success/10 text-success border border-success/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-success animate-pulse' : 'bg-destructive'}`}></div>
                                                {u.isActive ? 'نشط' : 'موقف'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-left">
                                            <div className="flex justify-start gap-1">
                                                <button 
                                                    onClick={() => {
                                                        setSelectedUser(u);
                                                        setFormData({
                                                            username: u.username,
                                                            email: u.email || '',
                                                            displayName: u.displayName || '',
                                                            password: '',
                                                            role: u.role,
                                                            branchId: u.branchId || '',
                                                            isActive: u.isActive
                                                        });
                                                        setIsEditMode(true);
                                                        setIsIdenOpen(true);
                                                    }}
                                                    className="p-2 bg-white border border-border text-muted-foreground hover:text-primary hover:border-primary/30 rounded-lg transition-all shadow-sm shrink-0"
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                                 <button 
                                                     onClick={async () => {
                                                         if (!confirm('هل أنت متأكد من إعادة تعيين كلمة المرور لهذا المستخدم؟')) return;
                                                         try {
                                                             const res = await adminClient.post(`/admin/users/${u.id}/reset-password`);
                                                             toast.success(`تم إعادة تعيين كلمة المرور: ${res.data.tempPassword}`);
                                                         } catch (err: any) {
                                                             toast.error(err.response?.data?.error || 'فشل في إعادة تعيين كلمة المرور');
                                                         }
                                                     }}
                                                     className="p-2 bg-white border border-border text-muted-foreground hover:text-yellow-600 hover:border-yellow-400/30 rounded-lg transition-all shadow-sm shrink-0"
                                                     title="إعادة تعيين كلمة المرور"
                                                 >
                                                     <Key size={15} />
                                                 </button>
                                                 <button 
                                                     onClick={async () => {
                                                         if (!confirm('هل أنت متأكد من فتح حساب هذا المستخدم؟')) return;
                                                         try {
                                                             await adminClient.post(`/admin/users/${u.id}/unlock`);
                                                             toast.success('تم فتح الحساب بنجاح');
                                                             fetchUsers();
                                                         } catch (err: any) {
                                                             toast.error(err.response?.data?.error || 'فشل في فتح الحساب');
                                                         }
                                                     }}
                                                     className="p-2 bg-white border border-border text-muted-foreground hover:text-green-600 hover:border-green-400/30 rounded-lg transition-all shadow-sm shrink-0"
                                                     title="فتح الحساب"
                                                 >
                                                    <Unlock size={15} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(u.id)}
                                                    className="p-2 bg-white border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 rounded-lg transition-all shadow-sm shrink-0"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* REFACTORED USER MODAL */}
            <Modal
                isOpen={isIdenOpen}
                onClose={() => setIsIdenOpen(false)}
                title={isEditMode ? 'تعديل هوية' : 'إنشاء هوية مستخدم'}
                subtitle="بروتوكول الوصول للمجموعة - العقدة 02"
                icon={<ShieldCheck className="text-brand-primary" size={36} />}
                maxWidth="max-w-2xl"
            >
                <form onSubmit={handleSave} className="space-y-6 sm:space-y-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">اسم المستخدم</label>
                            <input 
                                type="text" required 
                                className="smart-input text-right text-sm h-14"
                                value={formData.username}
                                onChange={(e) => setFormData({...formData, username: e.target.value})}
                                disabled={isEditMode}
                                dir="ltr"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">الاسم الكامل</label>
                            <input 
                                type="text" required 
                                className="smart-input text-right text-sm h-14"
                                value={formData.displayName}
                                onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">البريد الإلكتروني</label>
                            <input 
                                type="email" 
                                className="smart-input text-left text-sm h-14"
                                value={formData.email}
                                onChange={(e) => setFormData({...formData, email: e.target.value})}
                                dir="ltr"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">الدور الوظيفي</label>
                            <select 
                                className="smart-select bg-slate-50 border-transparent focus:bg-white text-right text-sm h-14"
                                value={formData.role}
                                onChange={(e) => setFormData({...formData, role: e.target.value})}
                            >
                                <option value="SUPER_ADMIN">مدير عام النظام</option>
                                <option value="MANAGEMENT">إدارة عليا</option>
                                <option value="BRANCH_ADMIN">مدير فرع</option>
                                <option value="ACCOUNTANT">محاسب</option>
                                <option value="CS_SUPERVISOR">مشرف خدمة عملاء</option>
                                <option value="CS_AGENT">موظف خدمة عملاء</option>
                                <option value="BRANCH_TECH">فني فرع</option>
                            </select>
                        </div>
                        <div className="space-y-2 col-span-1 sm:col-span-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">التبعية (الفرع)</label>
                            <select 
                                className="smart-select bg-slate-50 border-transparent focus:bg-white text-right text-sm h-14"
                                value={formData.branchId}
                                onChange={(e) => setFormData({...formData, branchId: e.target.value})}
                            >
                                <option value="">الإدارة العامة / المركز الرئيسي</option>
                                {Array.isArray(branches) && branches.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                        {!isEditMode && (
                            <div className="space-y-2 col-span-1 sm:col-span-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">كلمة المرور</label>
                                <input 
                                    type="password" required 
                                    className="smart-input text-left h-14"
                                    value={formData.password}
                                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                                    dir="ltr"
                                    placeholder="أدخل كلمة مرور قوية"
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-xl flex-row-reverse border border-border">
                        <input 
                            type="checkbox" 
                            id="isActive"
                            className="w-5 h-5 rounded-md text-primary focus:ring-primary accent-primary"
                            checked={formData.isActive}
                            onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                        />
                        <label htmlFor="isActive" className="text-xs font-black text-muted-foreground uppercase text-right">تفعيل وصول هذا المستخدم للنظام</label>
                    </div>

                    <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
                        <button 
                            type="submit" 
                            className="flex-[2] h-12 bg-primary text-white rounded-lg font-black uppercase tracking-widest text-[10px] hover:shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
                        >
                            <Save size={16} />
                            حفظ واعتماد الهوية
                        </button>
                        <button 
                            type="button" 
                            onClick={() => setIsIdenOpen(false)}
                            className="flex-1 h-12 bg-muted text-muted-foreground rounded-lg font-black uppercase tracking-widest text-[10px] hover:bg-muted/80 transition-all"
                        >
                            إلغاء
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
