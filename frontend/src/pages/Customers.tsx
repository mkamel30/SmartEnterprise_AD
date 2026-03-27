import { useState, useEffect } from 'react';
import adminClient from '../api/adminClient';
import { 
  Users, Search, RefreshCw, Building, MapPin, Phone, 
  Briefcase, Activity
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Customers() {
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchCustomers = async () => {
        try {
            setLoading(true);
            const res = await adminClient.get('/customers');
            setCustomers(res.data);
        } catch (error) {
            toast.error('فشل في تحميل سجل العملاء');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCustomers();
    }, []);

    const filtered = customers.filter(c => 
        c.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.bkcode?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 font-arabic" dir="rtl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="text-right">
                    <h1 className="text-xl lg:text-2xl font-black text-primary uppercase tracking-tight flex items-center gap-3">
                        <Users className="text-brand-cyan" size={24} />
                        سجل العملاء <span className="text-brand-cyan">الموحد</span>
                    </h1>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">إدارة علاقات العملاء عبر كافة فروع المجموعة</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto flex-row-reverse">
                    <button onClick={fetchCustomers} className="p-2.5 bg-white border-2 border-primary/10 text-muted-foreground rounded-lg hover:text-primary transition-all shadow-sm">
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <div className="relative flex-1 md:w-80">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
                        <input 
                            type="text" 
                            placeholder="بحث عن عميل..." 
                            className="w-full pr-10 pl-4 py-2.5 bg-white border-2 border-primary/10 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold text-sm text-right"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {loading ? (
                    Array(4).fill(0).map((_, i) => <div key={i} className="h-36 bg-white rounded-2xl animate-pulse"></div>)
                ) : filtered.length === 0 ? (
                    <div className="col-span-full py-16 bg-white rounded-2xl border-2 border-primary/10 text-center">
                        <Users className="mx-auto mb-3 text-muted-foreground/20" size={48} />
                        <p className="text-muted-foreground font-black uppercase tracking-widest text-sm">لا يوجد عملاء مسجلين</p>
                    </div>
                ) : (
                    filtered.map((c) => (
                        <div key={c.id} className="bg-white p-5 rounded-2xl border-2 border-primary/10 shadow-sm hover:shadow-md transition-all group text-right">
                            <div className="flex justify-between items-start flex-row-reverse">
                                <div className="flex items-start gap-4 flex-row-reverse">
                                    <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-white transition-all shrink-0">
                                        <Briefcase size={20} />
                                    </div>
                                    <div className="text-right">
                                        <h3 className="text-base font-black text-primary group-hover:text-primary/70 transition-colors uppercase">{c.client_name}</h3>
                                        <div className="flex items-center gap-2 mt-1 flex-row-reverse">
                                            <span className="text-[10px] font-black px-2 py-0.5 bg-brand-cyan/10 text-brand-cyan rounded uppercase" dir="ltr">{c.bkcode}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter flex-row-reverse ${c.status === 'Active' ? 'bg-success/10 text-success border border-success/20' : 'bg-muted text-muted-foreground/40'}`}>
                                    <div className={`w-1 h-1 rounded-full ${c.status === 'Active' ? 'bg-success animate-pulse' : 'bg-muted-foreground/30'}`}></div>
                                    {c.status === 'Active' ? 'نشط' : 'خامل'}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-4">
                                <div className="space-y-2 text-right">
                                    <div className="flex items-center gap-2 text-muted-foreground/60 flex-row-reverse">
                                        <Building size={13} />
                                        <span className="text-[11px] font-bold uppercase">{c.branch?.name || 'غير محدد'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-muted-foreground/60 flex-row-reverse">
                                        <MapPin size={13} />
                                        <span className="text-[11px] font-bold uppercase truncate">{c.address || 'بدون عنوان'}</span>
                                    </div>
                                </div>
                                <div className="space-y-2 text-right">
                                    <div className="flex items-center gap-2 text-muted-foreground/60 flex-row-reverse">
                                        <Phone size={13} />
                                        <span className="text-[11px] font-bold uppercase" dir="ltr">{c.telephone_1 || 'بدون'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-muted-foreground/60 flex-row-reverse">
                                        <Activity size={13} />
                                        <span className="text-[11px] font-bold uppercase">{c.machines?.length || 0} أجهزة</span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 pt-3 border-t border-border/50 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all flex-row-reverse">
                                <button className="flex items-center gap-1.5 px-4 py-1.5 bg-primary/5 text-primary rounded-lg hover:bg-primary hover:text-white transition-all text-[10px] font-black uppercase tracking-widest">
                                    التفاصيل
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
