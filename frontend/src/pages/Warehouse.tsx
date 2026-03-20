import { useState, useEffect } from 'react';
import adminClient from '../api/adminClient';
import { 
  Cpu, Search, RefreshCw, HardDrive, 
  ChevronRight, Activity, Layers, Package
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Warehouse() {
    const [machines, setMachines] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [view, setView] = useState<'warehouse' | 'fleet'>('warehouse');

    const fetchData = async () => {
        try {
            setLoading(true);
            const endpoint = view === 'warehouse' ? '/warehouse/machines' : '/warehouse/fleet';
            const res = await adminClient.get(endpoint);
            setMachines(res.data);
        } catch (error) {
            toast.error('فشل في جلب بيانات العتاد والأجهزة');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [view]);

    const filtered = machines.filter(m => 
        m.serialNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.model?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const statusMap: any = {
      'NEW': 'جديد بالكامل',
      'STANDBY': 'جاهز بالفرع',
      'DEPLOYED': 'عند عميل',
      'REPAIR': 'قيد الصيانة',
      'SCRAP': 'كهنة / تالف'
    };

    return (
        <div className="space-y-6 font-arabic" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="text-right">
                    <h1 className="text-xl lg:text-2xl font-black text-primary uppercase tracking-tight flex items-center gap-3">
                        <Layers className="text-brand-cyan" size={24} />
                        شبكة العتاد <span className="text-brand-cyan">المركزي</span>
                    </h1>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">تدقيق ومراقبة كافة أجهزة POS والأصول على مستوى المجموعة</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto flex-row-reverse">
                    <button onClick={fetchData} className="p-2.5 bg-white border-2 border-primary/10 text-muted-foreground hover:text-primary transition-all shadow-sm rounded-lg">
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <div className="relative flex-1 md:w-80">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
                        <input
                            type="text"
                            placeholder="بحث في الأصول (سيريال أو موديل)..." 
                            className="w-full pr-10 pl-4 py-2.5 bg-white border-2 border-primary/10 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold text-sm text-right"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* View Switcher */}
            <div className="flex gap-2 p-1.5 bg-muted/50 rounded-xl self-start inline-flex border border-border flex-row-reverse">
                <button 
                    onClick={() => setView('warehouse')}
                    className={`flex items-center gap-2 px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex-row-reverse ${view === 'warehouse' ? 'bg-white text-primary shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <Package size={14} />
                    مخزون الفروع
                </button>
                <button 
                    onClick={() => setView('fleet')}
                    className={`flex items-center gap-2 px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex-row-reverse ${view === 'fleet' ? 'bg-white text-primary shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    <Activity size={14} />
                    الأجهزة المشغلة
                </button>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden">
                <table className="w-full text-right font-arabic">
                    <thead>
                        <tr className="border-b-2 border-primary/10 bg-muted/50">
                            <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">معرف الجهاز (S/N)</th>
                            <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">الموديل</th>
                            <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{view === 'warehouse' ? 'الفرع' : 'العميل'}</th>
                            <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">الحالة</th>
                            <th className="p-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] text-left">السجل</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {loading ? (
                            Array(5).fill(0).map((_, i) => <tr key={i}><td colSpan={5} className="p-4"><div className="h-8 bg-muted rounded-lg animate-pulse"></div></td></tr>)
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="p-12 text-center">
                                    <Cpu className="mx-auto mb-3 text-muted-foreground/20" size={48} />
                                    <p className="text-muted-foreground/40 font-bold uppercase tracking-widest text-sm">لا توجد أصول مطابقة</p>
                                </td>
                            </tr>
                        ) : (
                            filtered.map((m) => (
                                <tr key={m.id} className="group hover:bg-muted/30 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3 flex-row-reverse">
                                            <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-white transition-all shrink-0">
                                                <HardDrive size={18} />
                                            </div>
                                            <div className="text-right">
                                                <p className="font-black text-primary group-hover:text-primary/70 transition-colors uppercase" dir="ltr">{m.serialNumber}</p>
                                                <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mt-0.5">أصل ذكي</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className="text-xs font-black text-muted-foreground uppercase">{m.model || 'غير معرف'}</span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className="text-xs font-black text-muted-foreground uppercase">
                                            {view === 'warehouse' ? (m.branch?.name || 'المركز الرئيسي') : (m.customer?.client_name || 'غير مخصص')}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter flex-row-reverse ${
                                            (m.status === 'NEW' || m.status === 'STANDBY') ? 'bg-success/10 text-success border border-success/20' : 
                                            m.status === 'REPAIR' ? 'bg-warning/10 text-amber-600 border border-warning/20' :
                                            'bg-primary/5 text-primary border border-primary/10'
                                        }`}>
                                            <div className={`w-1.5 h-1.5 rounded-full ${m.status === 'NEW' ? 'bg-success animate-pulse' : 'bg-muted-foreground/30'}`}></div>
                                            {statusMap[m.status] || m.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-left">
                                        <button className="p-2 bg-muted text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-all">
                                            <ChevronRight size={16} className="transform rotate-180" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
