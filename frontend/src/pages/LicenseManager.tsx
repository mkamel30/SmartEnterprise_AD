import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    Key, 
    Plus, 
    ShieldAlert, 
    History, 
    Search,
    MoreHorizontal,
    Monitor,
    Building,
    Calendar,
    ArrowRightCircle,
    CheckCircle2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import adminClient from '../api/adminClient';

const API_BASE = '/licenses';

export default function LicenseManager() {
    const [view, setView] = useState<'all' | 'audit' | 'expired'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    
    // New License Form State
    const [newLicense, setNewLicense] = useState({
        branchCode: '',
        branchName: '',
        type: 'BRANCH',
        expirationDate: '',
        maxActivations: 1
    });

    // Fetch Licenses
    const { data: licensesData, isLoading: licensesLoading, refetch: refetchLicenses } = useQuery({
        queryKey: ['licenses-list'],
        queryFn: async () => {
            const res = await adminClient.get(`${API_BASE}`);
            return res.data;
        }
    });

    const handleCreateLicense = async () => {
        try {
            await adminClient.post(`${API_BASE}/create`, newLicense);
            toast.success('تم إنشاء الترخيص بنجاح');
            setIsCreateOpen(false);
            refetchLicenses();
        } catch (error) {
            toast.error('فشل إنشاء الترخيص');
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE': return <span className="smart-badge smart-badge-success">نشط</span>;
            case 'SUSPENDED': return <span className="smart-badge smart-badge-warning">معلق</span>;
            case 'REVOKED': return <span className="smart-badge smart-badge-danger">مسحوب</span>;
            case 'EXPIRED': return <span className="smart-badge smart-badge-danger">منتهي</span>;
            default: return <span className="smart-badge">{status}</span>;
        }
    };

    return (
        <div className="space-y-6 animate-fade-in" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-foreground flex items-center gap-3">
                        <Key className="text-primary" size={32} />
                        إدارة التراخيص (Licensing)
                    </h1>
                    <p className="text-muted-foreground font-bold mt-1">إصدار وتفعيل مفاتيح التشغيل للفروع والأجهزة</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setIsCreateOpen(true)}
                        className="smart-btn-primary flex items-center gap-2"
                    >
                        <Plus size={18} />
                        <span>إنشاء ترخيص جديد</span>
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="إجمالي التراخيص" value={licensesData?.licenses?.length || 0} icon={<Key className="text-primary" />} />
                <StatCard title="تراخيص نشطة" value={licensesData?.licenses?.filter((l:any) => l.status === 'ACTIVE').length || 0} icon={<CheckCircle2 className="text-success" />} />
                <StatCard title="تراخيص منتهية" value={licensesData?.licenses?.filter((l:any) => l.status === 'EXPIRED').length || 0} icon={<History className="text-destructive" />} />
                <StatCard title="محاولات غير مصرحة" value={0} icon={<ShieldAlert className="text-warning" />} />
            </div>

            <div className="bg-card rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <div className="flex border-b border-border bg-muted/30 p-2 gap-2">
                    <button 
                        onClick={() => setView('all')}
                        className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${view === 'all' ? 'bg-primary text-white shadow-md' : 'text-muted-foreground hover:bg-muted font-bold'}`}
                    >
                        كل التراخيص
                    </button>
                    <button 
                        onClick={() => setView('expired')}
                        className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${view === 'expired' ? 'bg-primary text-white shadow-md' : 'text-muted-foreground hover:bg-muted font-bold'}`}
                    >
                        تراخيص منتهية
                    </button>
                </div>

                <div className="p-6">
                    {/* Search & Filter Bar */}
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                            <input 
                                type="text"
                                placeholder="ابحث بمفتاح الترخيص، كود الفرع، أو HWID..."
                                className="smart-input pl-4 pr-10 py-2.5"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Table */}
                    <div className="table-container custom-scrollbar max-h-[600px] overflow-y-auto">
                        <table className="min-w-full">
                            <thead className="bg-muted/50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-4 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">معلومات الترخيص</th>
                                    <th className="px-6 py-4 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">الفرع / الجهاز</th>
                                    <th className="px-6 py-4 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">تاريخ الانتهاء</th>
                                    <th className="px-6 py-4 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">تفعيلات</th>
                                    <th className="px-6 py-4 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">الحالة</th>
                                    <th className="px-6 py-4 text-center text-xs font-black text-muted-foreground uppercase tracking-widest">إجراءات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {licensesLoading ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground font-bold italic">جاري تحميل سجلات التراخيص...</td>
                                    </tr>
                                ) : licensesData?.licenses?.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground font-bold italic">لا توجد تراخيص مصدرة حالياً</td>
                                    </tr>
                                ) : (
                                    licensesData?.licenses?.filter((l:any) => 
                                        l.licenseKey.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        (l.branchCode && l.branchCode.toLowerCase().includes(searchTerm.toLowerCase()))
                                    ).map((license: any) => (
                                        <tr key={license.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="font-mono text-sm font-black text-[#0A2472]">{license.licenseKey}</div>
                                                <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{license.type}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <Building size={14} className="text-muted-foreground" />
                                                    <span className="text-sm font-bold">{license.branchName || license.branchCode || 'عام / غير مقيد'}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Monitor size={12} className="text-muted-foreground" />
                                                    <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[150px]">{license.hwid || 'لم يتم الربط بعد'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold">
                                                {license.expirationDate ? (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar size={14} className="text-muted-foreground" />
                                                        {new Date(license.expirationDate).toLocaleDateString('ar-EG')}
                                                    </span>
                                                ) : 'دائم (Unlimited)'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-xs font-black">
                                                    {license.activationCount} / {license.maxActivations}
                                                </div>
                                                <div className="w-full bg-muted rounded-full h-1 mt-1 overflow-hidden">
                                                    <div 
                                                        className="bg-primary h-full transition-all" 
                                                        style={{ width: `${(license.activationCount / license.maxActivations) * 100}%` }}
                                                    ></div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {getStatusBadge(license.status)}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-primary">
                                                    <MoreHorizontal size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Create License Modal */}
            {isCreateOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" dir="rtl">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
                        <div className="p-6 border-b border-border bg-muted/30">
                            <h3 className="text-xl font-black text-foreground flex items-center gap-2">
                                <Key className="text-primary" size={24} />
                                إصدار ترخيص فرع جديد
                            </h3>
                            <p className="text-xs text-muted-foreground font-bold mt-1">سيتم توليد مفتاح ترخيص فريد للفرع المحدد</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pr-1">كود الفرع</label>
                                    <input 
                                        type="text" 
                                        className="smart-input px-4 py-3 font-bold" 
                                        placeholder="BR-001"
                                        value={newLicense.branchCode}
                                        onChange={(e) => setNewLicense({...newLicense, branchCode: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pr-1">نوع الترخيص</label>
                                    <select 
                                        className="smart-input px-4 py-3 font-bold"
                                        value={newLicense.type}
                                        onChange={(e) => setNewLicense({...newLicense, type: e.target.value})}
                                    >
                                        <option value="BRANCH">فرع (Standard)</option>
                                        <option value="ENTERPRISE">مؤسسة (Enterprise)</option>
                                        <option value="TRIAL">تجريبي (Trial)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pr-1">اسم الفرع / العميل</label>
                                <input 
                                    type="text" 
                                    className="smart-input px-4 py-3 font-bold" 
                                    value={newLicense.branchName}
                                    onChange={(e) => setNewLicense({...newLicense, branchName: e.target.value})}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pr-1">تاريخ الانتهاء</label>
                                    <input 
                                        type="date" 
                                        className="smart-input px-4 py-3 font-bold" 
                                        value={newLicense.expirationDate}
                                        onChange={(e) => setNewLicense({...newLicense, expirationDate: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pr-1">أقصى تفعيلات (HWID)</label>
                                    <input 
                                        type="number" 
                                        className="smart-input px-4 py-3 font-bold" 
                                        value={newLicense.maxActivations}
                                        onChange={(e) => setNewLicense({...newLicense, maxActivations: parseInt(e.target.value)})}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 bg-muted/30 flex gap-3">
                            <button onClick={handleCreateLicense} className="flex-2 smart-btn-primary flex items-center justify-center gap-2">
                                <ArrowRightCircle size={18} />
                                توليد الترخيص الآن
                            </button>
                            <button onClick={() => setIsCreateOpen(false)} className="flex-1 smart-btn-secondary">إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ title, value, icon }: any) {
    return (
        <div className="bg-card p-5 rounded-2xl border-2 border-primary/5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-muted/50 rounded-xl">{icon}</div>
                <span className="text-2xl font-black">{value}</span>
            </div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{title}</p>
        </div>
    );
}
