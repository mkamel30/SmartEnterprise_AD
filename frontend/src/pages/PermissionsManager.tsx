import { useState, useEffect } from 'react';
import adminClient from '../api/adminClient';
import { 
    ShieldCheck, 
    Save, 
    RefreshCw, 
    Search, 
    Lock, 
    ChevronDown, 
    FileText, 
    Wrench, 
    History, 
    CheckCircle2, 
    XCircle,
    Info,
    RotateCcw
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function PermissionsManager() {
    const [matrix, setMatrix] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'pages' | 'actions'>('pages');

    const fetchPermissions = async () => {
        try {
            setLoading(true);
            const res = await adminClient.get('/permissions');
            setMatrix(res.data);
        } catch (error) {
            toast.error('فشل في تحميل مصفوفة الصلاحيات');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPermissions();
    }, []);

    const handleToggle = (role: string, type: 'pages' | 'actions', key: string) => {
        setMatrix((prev: any) => ({
            ...prev,
            [type]: {
                ...prev[type],
                [key]: {
                    ...prev[type][key],
                    [role]: !prev[type][key][role]
                }
            }
        }));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const permissionsToUpdate: any[] = [];
            
            // Build bulk update payload
            ['pages', 'actions'].forEach((type) => {
                const permissionType = type === 'pages' ? 'PAGE' : 'ACTION';
                Object.entries(matrix[type]).forEach(([key, roles]: [string, any]) => {
                    Object.entries(roles).forEach(([role, isAllowed]) => {
                        permissionsToUpdate.push({
                            role,
                            permissionType,
                            permissionKey: key,
                            isAllowed
                        });
                    });
                });
            });

            await adminClient.post('/permissions/bulk', { permissions: permissionsToUpdate });
            toast.success('تم حفظ وتحديث الصلاحيات بنجاح');
        } catch (error) {
            toast.error('فشل في حفظ الصلاحيات');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (!confirm('هل أنت متأكد من استعادة الإعدادات الافتراضية؟ سيتم مسح كل التعديلات المخصصة.')) return;
        try {
            setLoading(true);
            await adminClient.post('/permissions/reset');
            toast.success('تمت استعادة الإعدادات الافتراضية');
            fetchPermissions();
        } catch (error) {
            toast.error('فشل في استعادة الصلاحيات');
        } finally {
            setLoading(false);
        }
    };

    if (loading && !matrix) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <RefreshCw className="animate-spin text-primary" size={48} />
                <p className="text-muted-foreground font-black animate-pulse">جاري فحص مصفوفة الأمان...</p>
            </div>
        );
    }

    const roles = matrix?.roles || [];
    const currentData = matrix ? (activeTab === 'pages' ? matrix.pages : matrix.actions) : {};
    
    // Filter data based on search
    const filteredKeys = Object.keys(currentData).filter(key => 
        key.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const roleMap: any = {
        'SUPER_ADMIN': 'مدير عام',
        'MANAGEMENT': 'إدارة عليا',
        'BRANCH_ADMIN': 'أدمن فرع',
        'ACCOUNTANT': 'محاسب',
        'BRANCH_MANAGER': 'رئيس فرع',
        'CS_SUPERVISOR': 'مشرف CS',
        'CS_AGENT': 'موظف CS',
        'BRANCH_TECH': 'فني فرع'
    };

    return (
        <div className="space-y-6 font-arabic" dir="rtl">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white p-6 rounded-2xl border-2 border-primary/10 shadow-sm">
                <div>
                    <h1 className="text-2xl font-black text-primary flex items-center gap-3">
                        <ShieldCheck className="text-brand-cyan" size={32} />
                        إدارة <span className="text-brand-cyan">الأدوار والصلاحيات</span>
                    </h1>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">التحكم المركزي في بروتوكولات الوصول لكافة فروع المجموعة</p>
                </div>
                <div className="flex gap-3 w-full lg:w-auto">
                    <button 
                        onClick={handleReset}
                        className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] hover:bg-slate-200 transition-all border-2 border-transparent"
                    >
                        <RotateCcw size={16} />
                        استعادة الافتراضي
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-8 py-3 bg-primary text-white rounded-xl font-black text-[10px] hover:shadow-xl transition-all active:scale-95 disabled:opacity-50"
                    >
                        {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                        حفظ وتحديث المصفوفة
                    </button>
                </div>
            </div>

            {/* Matrix Container */}
            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden flex flex-col">
                {/* Tabs & Search */}
                <div className="p-4 border-b-2 border-primary/5 flex flex-col md:flex-row gap-4 items-center bg-slate-50/50">
                    <div className="flex bg-white p-1 rounded-xl border border-primary/10 w-full md:w-auto">
                        <button 
                            onClick={() => setActiveTab('pages')}
                            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'pages' ? 'bg-primary text-white shadow-md' : 'text-muted-foreground hover:bg-slate-50'}`}
                        >
                            صفحات النظام
                        </button>
                        <button 
                            onClick={() => setActiveTab('actions')}
                            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'actions' ? 'bg-primary text-white shadow-md' : 'text-muted-foreground hover:bg-slate-50'}`}
                        >
                            عمليات الأدوات
                        </button>
                    </div>
                    <div className="relative flex-1 w-full">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={18} />
                        <input 
                            type="text" 
                            placeholder="ابحث عن صفحة أو عملية محددة..." 
                            className="w-full pr-11 pl-4 py-2.5 bg-white border-2 border-primary/5 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold text-sm text-right"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Matrix Table */}
                <div className="overflow-x-auto custom-scroll overflow-y-auto max-h-[60vh]">
                    <table className="w-full text-right border-collapse">
                        <thead className="sticky top-0 z-20 bg-white shadow-sm">
                            <tr className="border-b-2 border-primary/10">
                                <th className="p-4 text-[10px] font-black text-primary bg-slate-50/80 backdrop-blur sticky right-0 z-30 min-w-[200px] border-l">
                                    المسار / الوظيفة
                                </th>
                                {roles.map((role: string) => (
                                    <th key={role} className="p-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest text-center min-w-[100px] bg-slate-50/80">
                                        {roleMap[role] || role}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredKeys.length === 0 ? (
                                <tr>
                                    <td colSpan={roles.length + 1} className="p-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <Search className="text-slate-200" size={64} />
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">لا توجد نتائج لمصفوفة الصلاحيات الحالية</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredKeys.map((key) => (
                                    <tr key={key} className="group hover:bg-primary/[0.02] transition-colors">
                                        <td className="p-4 bg-white group-hover:bg-primary/[0.03] sticky right-0 z-10 border-l shadow-[2px_0_10px_rgba(0,0,0,0.02)]">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all shrink-0">
                                                    {activeTab === 'pages' ? <FileText size={16} /> : <Wrench size={16} />}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-slate-700 leading-none mb-1">{key}</span>
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter" dir="ltr">
                                                        {activeTab === 'pages' ? 'Endpoint Route' : 'System Action ID'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        {roles.map((role: string) => {
                                            const isAllowed = currentData[key][role];
                                            const isSuperAdmin = role === 'SUPER_ADMIN';
                                            return (
                                                <td key={role} className="p-4 text-center">
                                                    <button 
                                                        onClick={() => !isSuperAdmin && handleToggle(role, activeTab, key)}
                                                        disabled={isSuperAdmin}
                                                        className={`
                                                            relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 mx-auto
                                                            ${isAllowed 
                                                                ? 'bg-success/10 text-success border-2 border-success/20 shadow-[0_4px_12px_rgba(34,197,94,0.1)] hover:scale-110 active:scale-90' 
                                                                : 'bg-slate-50 text-slate-300 border-2 border-slate-100 hover:bg-slate-100'
                                                            }
                                                            ${isSuperAdmin ? 'cursor-not-allowed opacity-50 bg-slate-200 text-slate-500 border-slate-300' : ''}
                                                        `}
                                                        title={isSuperAdmin ? 'لا يمكن تعديل صلاحيات المدير العام' : (isAllowed ? 'إلغاء الصلاحية' : 'منح الصلاحية')}
                                                    >
                                                        {isSuperAdmin ? <Lock size={16} /> : (isAllowed ? <CheckCircle2 size={20} /> : <XCircle size={20} />)}
                                                    </button>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer Info */}
                <div className="p-4 bg-slate-50 border-t-2 border-primary/5 flex items-center gap-4 text-slate-500">
                    <Info size={16} className="text-primary" />
                    <p className="text-[10px] font-bold">ملحوظة: صلاحيات <span className="font-black text-primary">SUPER_ADMIN</span> محصنة ولا يمكن تعديلها برمجياً لضمان استقرار الوصول للنظام.</p>
                </div>
            </div>
        </div>
    );
}
