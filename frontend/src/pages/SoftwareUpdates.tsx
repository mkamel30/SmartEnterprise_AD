import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    Github, 
    Download, 
    RefreshCw, 
    Settings as SettingsIcon, 
    CheckCircle, 
    AlertCircle,
    ExternalLink,
    Clock,
    Package
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import adminClient from '../api/adminClient';

const API_BASE = '/github';

export default function SoftwareUpdates() {
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [config, setConfig] = useState({
        repoOwner: 'mkamel30',
        repoName: 'SmartEnterprise_BR',
        patToken: ''
    });

    // Fetch Releases
    const { data: releasesData, isLoading: releasesLoading, refetch: refetchReleases } = useQuery({
        queryKey: ['github-releases'],
        queryFn: async () => {
            const res = await adminClient.get(`${API_BASE}/releases`);
            return res.data;
        }
    });

    // Fetch Latest
    const { data: latestData } = useQuery({
        queryKey: ['github-latest'],
        queryFn: async () => {
            const res = await adminClient.get(`${API_BASE}/releases/latest`);
            return res.data;
        }
    });

    // Fetch Settings
    const { data: settingsData } = useQuery({
        queryKey: ['github-settings'],
        queryFn: async () => {
            const res = await adminClient.get(`${API_BASE}/settings`);
            return res.data;
        }
    });

    const handleSaveSettings = async () => {
        try {
            await adminClient.post(`${API_BASE}/settings`, config);
            toast.success('تم حفظ إعدادات GitHub بنجاح');
            setIsConfigOpen(false);
        } catch (error) {
            toast.error('فشل حفظ الإعدادات');
        }
    };

    return (
        <div className="space-y-6 animate-fade-in" dir="rtl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-foreground flex items-center gap-3">
                        <Github className="text-primary" size={32} />
                        تحديثات النظام (Releases)
                    </h1>
                    <p className="text-muted-foreground font-bold mt-1">إدارة إصدارات البرنامج وتوزيعها على الفروع من GitHub</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setIsConfigOpen(true)}
                        className="smart-btn-secondary flex items-center gap-2"
                    >
                        <SettingsIcon size={18} />
                        <span>إعدادات الاتصال</span>
                    </button>
                    <button 
                        onClick={() => refetchReleases()}
                        className="smart-btn-primary flex items-center gap-2"
                    >
                        <RefreshCw size={18} className={releasesLoading ? 'animate-spin' : ''} />
                        <span>فحص الإصدارات</span>
                    </button>
                </div>
            </div>

            {/* Connection Status */}
            <div className={`p-4 rounded-2xl border-2 flex items-center justify-between ${settingsData?.hasToken ? 'bg-success/5 border-success/10' : 'bg-red-50 border-red-100'}`}>
                <div className="flex items-center gap-3">
                    {settingsData?.hasToken ? (
                        <CheckCircle className="text-success" size={24} />
                    ) : (
                        <AlertCircle className="text-destructive" size={24} />
                    )}
                    <div>
                        <p className="text-sm font-black uppercase tracking-widest text-[#0A2472]">
                            حالة الاتصال بـ GitHub
                        </p>
                        <p className="text-xs font-bold text-muted-foreground">
                            {settingsData?.hasToken ? `متصل بمستودع: ${settingsData.repoOwner}/${settingsData.repoName}` : 'غير متصل (برجاء إدخال الـ Personal Access Token)'}
                        </p>
                    </div>
                </div>
                <div className="text-[10px] font-mono bg-white/50 px-3 py-1 rounded-full border border-border">
                    {settingsData?.repoName}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Latest Release Information */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-card rounded-2xl border-2 border-primary/10 shadow-sm p-6 overflow-hidden relative">
                        <div className="absolute top-0 right-0 px-4 py-1 bg-primary text-white text-[10px] font-black rounded-bl-xl uppercase tracking-widest">
                            Latest Version
                        </div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-primary/10 rounded-2xl">
                                <Package className="text-primary" size={24} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-foreground">{latestData?.release?.version || 'v1.0.0'}</h2>
                                <p className="text-xs font-bold text-muted-foreground">{new Date(latestData?.release?.publishedAt).toLocaleDateString('ar-EG')}</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="p-3 bg-muted/50 rounded-xl">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Release Highlights</p>
                                <p className="text-sm font-bold line-clamp-3">{latestData?.release?.body || 'لا يوجد وصف متاح'}</p>
                            </div>
                            <a 
                                href={latestData?.release?.htmlUrl} 
                                target="_blank" 
                                className="w-full flex items-center justify-center gap-2 py-3 bg-primary/5 hover:bg-primary/10 text-primary rounded-xl font-black text-xs transition-all"
                            >
                                <ExternalLink size={14} />
                                عرض على GitHub
                            </a>
                        </div>
                    </div>

                    <div className="bg-card rounded-2xl border-2 border-primary/10 shadow-sm p-6">
                        <h3 className="text-sm font-black text-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Clock size={16} />
                            فحوصات المزامنة
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-muted-foreground">آخر فحص تلقائي:</span>
                                <span className="font-black">قبل 12 دقيقة</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-muted-foreground">الإصدار الحالي بالفروع:</span>
                                <span className="font-black text-success">v1.0.0</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-muted-foreground">التحديث التلقائي:</span>
                                <span className="bg-success text-white px-2 py-0.5 rounded-full text-[9px]">نشط</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Release History Table */}
                <div className="lg:col-span-2">
                    <div className="bg-card rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-border bg-muted/30">
                            <h3 className="text-sm font-black text-foreground">سجل الإصدارات (Releases History)</h3>
                        </div>
                        <div className="table-container custom-scrollbar max-h-[600px] overflow-y-auto">
                            <table className="min-w-full">
                                <thead className="bg-muted/50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-4 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">الإصدار</th>
                                        <th className="px-6 py-4 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">تاريخ النشر</th>
                                        <th className="px-6 py-4 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">المرفقات</th>
                                        <th className="px-6 py-4 text-center text-xs font-black text-muted-foreground uppercase tracking-widest">إجراءات</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {releasesLoading ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground font-bold italic">جاري تحميل السجلات من GitHub...</td>
                                        </tr>
                                    ) : releasesData?.releases?.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground font-bold italic">لا توجد إصدارات منشورة حالياً</td>
                                        </tr>
                                    ) : (
                                        releasesData?.releases?.map((release: any) => (
                                            <tr key={release.id} className="hover:bg-muted/30 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-black text-[#0A2472]">{release.version}</div>
                                                    <div className="text-[10px] text-muted-foreground">{release.name}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-muted-foreground">
                                                    {new Date(release.publishedAt).toLocaleDateString('ar-EG')}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex flex-wrap gap-1">
                                                        {release.assets?.map((asset: any, i: number) => (
                                                            <span key={i} className="text-[9px] bg-primary/5 text-primary border border-primary/10 rounded-full px-2 py-0.5 font-bold">
                                                                {asset.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button className="p-2 hover:bg-primary/10 rounded-lg text-primary transition-all" title="تحميل الإصدار">
                                                        <Download size={18} />
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
            </div>

            {/* Config Modal placeholder */}
            {isConfigOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" dir="rtl">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
                        <div className="p-6 border-b border-border bg-muted/30">
                            <h3 className="text-xl font-black text-foreground">إعدادات GitHub</h3>
                            <p className="text-xs text-muted-foreground font-bold mt-1">تكوين مستودع البرنامج والـ Token الخاص بالوصول</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pr-1">GitHub Owner</label>
                                <input 
                                    type="text" 
                                    className="smart-input px-4 py-3 font-bold" 
                                    value={config.repoOwner}
                                    onChange={(e) => setConfig({...config, repoOwner: e.target.value})}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pr-1">Repository Name</label>
                                <input 
                                    type="text" 
                                    className="smart-input px-4 py-3 font-bold" 
                                    value={config.repoName}
                                    onChange={(e) => setConfig({...config, repoName: e.target.value})}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pr-1">Personal Access Token (PAT)</label>
                                <input 
                                    type="password" 
                                    placeholder="ghp_xxxxxxxxxxxx"
                                    className="smart-input px-4 py-3 font-bold" 
                                    value={config.patToken}
                                    onChange={(e) => setConfig({...config, patToken: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="p-4 bg-muted/30 flex gap-3">
                            <button onClick={handleSaveSettings} className="flex-1 smart-btn-primary">حفظ الإعدادات</button>
                            <button onClick={() => setIsConfigOpen(false)} className="flex-1 smart-btn-secondary">إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ title, value, icon, color }: any) {
    return (
        <div className="bg-card p-5 rounded-2xl border-2 border-primary/5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-xl bg-opacity-10 ${color.replace('text-', 'bg-')}`}>{icon}</div>
                <span className={`text-2xl font-black ${color}`}>{value}</span>
            </div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{title}</p>
        </div>
    );
}
