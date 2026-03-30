// @ts-nocheck
import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Package, Edit, Download, Upload, History, X, Briefcase, Search, Radio, Eye, Wifi, WifiOff, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';
import Modal from '../Modal';
import * as XLSX from 'xlsx';
import { api } from '../../api/client';
import { useApiMutation } from '../../hooks/useApiMutation';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { io as socketIo } from 'socket.io-client';

export function SparePartsTab() {
    const { user } = useAuth();
    const [showAddForm, setShowAddForm] = useState(false);
    const [showEditForm, setShowEditForm] = useState(false);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [showPriceLogs, setShowPriceLogs] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedPart, setSelectedPart] = useState(null);
    const [importData, setImportData] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const fileInputRef = useRef(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [modelFilter, setModelFilter] = useState('');

    useEffect(() => {
        const handleEsc = (e) => { if (e.key === 'Escape') { setShowAddForm(false); setShowEditForm(false); setShowImportDialog(false); setShowPriceLogs(false); setShowDetailModal(false); } };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const [newPart, setNewPart] = useState({ name: '', compatibleModels: '', defaultCost: 0, isConsumable: false, allowsMultiple: false, maxQuantity: 1, category: '' });

    const { data: partsData, isLoading } = useQuery({ queryKey: ['spare-parts'], queryFn: () => api.get('/spare-parts') });
    const parts = Array.isArray(partsData) ? partsData : (partsData?.data || []);

    const createMutation = useApiMutation({ mutationFn: (data) => api.post('/spare-parts', { ...data, userId: user?.id, userName: user?.displayName || user?.email }), successMessage: 'تم إضافة القطعة بنجاح', errorMessage: 'فشل إضافة القطعة', invalidateKeys: [['spare-parts']], onSuccess: () => { setShowAddForm(false); setNewPart({ name: '', compatibleModels: '', defaultCost: 0, isConsumable: false, allowsMultiple: false, maxQuantity: 1, category: '' }); } });
    const updateMutation = useApiMutation({ mutationFn: ({ id, data }) => api.put('/spare-parts/' + id, { ...data, userId: user?.id, userName: user?.displayName || user?.email }), successMessage: 'تم تحديث القطعة بنجاح', errorMessage: 'فشل تحديث القطعة', invalidateKeys: [['spare-parts']], onSuccess: () => { setShowEditForm(false); setSelectedPart(null); } });
    const deleteMutation = useApiMutation({ mutationFn: (id) => api.delete('/spare-parts/' + id), successMessage: 'تم حذف القطعة', errorMessage: 'فشل حذف القطعة', invalidateKeys: [['spare-parts']] });
    const bulkDeleteMutation = useApiMutation({ mutationFn: (ids) => api.post('/spare-parts/bulk-delete', { ids, userId: user?.id, userName: user?.displayName || user?.email }), successMessage: 'تم حذف القطع المحددة', errorMessage: 'فشل حذف القطع', invalidateKeys: [['spare-parts']], onSuccess: () => { setSelectedIds(new Set()); } });
    const importMutation = useApiMutation({ mutationFn: (parts) => api.post('/spare-parts/import', { parts, userId: user?.id, userName: user?.displayName || user?.email }), successMessage: 'تم استيراد البيانات بنجاح', errorMessage: 'فشل استيراد البيانات', invalidateKeys: [['spare-parts']], onSuccess: (data) => { setShowImportDialog(false); setImportData([]); if (fileInputRef.current) fileInputRef.current.value = ''; if (data?.skipped > 0) toast(`تم تخطي ${data?.skipped} عنصر مكرر`, { icon: 'ℹ️' }); } });
    const broadcastMutation = useApiMutation({ mutationFn: () => api.post('/spare-parts/broadcast'), successMessage: 'تم بث تحديثات قطع الغيار لجميع الفروع بنجاح', errorMessage: 'فشل بث التحديثات للفروع' });

    const allModels = Array.from(new Set(parts.flatMap((p) => (p.compatibleModels || '').split(';').filter(Boolean).map((m) => m.trim())))).sort();
    const filteredParts = parts.filter((p) => {
        const matchesSearch = !searchTerm || (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (p.partNumber || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesModel = !modelFilter || (p.compatibleModels || '').toLowerCase().split(';').map((m) => m.trim()).includes(modelFilter.toLowerCase());
        return matchesSearch && matchesModel;
    });

    const toggleSelectAll = () => { if (selectedIds.size === parts?.length) setSelectedIds(new Set()); else setSelectedIds(new Set(parts?.map((p) => p.id))); };
    const toggleSelect = (id) => { const newSet = new Set(selectedIds); if (newSet.has(id)) newSet.delete(id); else newSet.add(id); setSelectedIds(newSet); };

    if (isLoading) return <div className='flex items-center justify-center h-64'><div className='flex flex-col items-center gap-3'><div className='w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin' /><p className='text-sm font-bold text-muted-foreground'>جاري التحميل...</p></div></div>;

    return (
        <div className='space-y-6 animate-fade-in'>
            <div className='flex flex-col lg:flex-row lg:items-center justify-between gap-4'>
                <div><h1 className='text-2xl font-black text-primary flex items-center gap-3'><div className='w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center'><Package size={22} className='text-primary' /></div> قانون قطع الغيار</h1><p className='text-sm text-muted-foreground mt-1 font-medium'>الموديلات مفصولة بفاصلة منقوطة (;) · الحروف الصغيرة فقط</p></div>
                <div className='flex flex-wrap items-center gap-2'>
                    {selectedIds.size > 0 && <Button variant='destructive' size='sm' onClick={() => { if (confirm(`هل أنت متأكد من حذف ${selectedIds.size} عنصر؟`)) bulkDeleteMutation.mutate(Array.from(selectedIds)); }} className='gap-1.5 animate-pulse'><Trash2 size={14} /> حذف ({selectedIds.size})</Button>}
                    <Button variant='outline' size='sm' onClick={() => { const d=[{n:'شاشة LCD',m:'s90;d210;vx520',p:150,c:false,a:true,q:3,cat:'POS'},{n:'لوحة مفاتيح',m:'vx680;s80',p:80,c:false,a:false,q:1,cat:'GENERAL'}]; const ws=XLSX.utils.json_to_sheet(d.map(x=>({'اسم القطعة':x.n,'الموديلات المتوافقة':x.m,'السعر':x.p,'قطعة استهلاكية':x.c?'نعم':'لا','يمكن تغير أكثر من واحدة':x.a?'نعم':'لا','الحد الأقصى':x.q,'التصنيف':x.cat}))); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'قطع الغيار'); XLSX.writeFile(wb,'spare_parts_template.xlsx'); }} className='gap-1.5'><Download size={14} /> قالب</Button>
                    <Button variant='outline' size='sm' onClick={() => fileInputRef.current?.click()} className='gap-1.5'><Upload size={14} /> استيراد</Button>
                    <input ref={fileInputRef} type='file' accept='.xlsx,.xls' onChange={(e) => { const file=e.target.files?.[0]; if(!file)return; const reader=new FileReader(); reader.onload=(ev)=>{const wb=XLSX.read(new Uint8Array(ev.target?.result),{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]]; const rows=XLSX.utils.sheet_to_json(ws); const parsed=rows.map((r)=>({name:r['اسم القطعة']||'',compatibleModels:r['الموديلات المتوافقة']||'',defaultCost:parseFloat(r['السعر'])||0,isConsumable:r['قطعة استهلاكية']==='نعم',allowsMultiple:r['يمكن تغير أكثر من واحدة']==='نعم',maxQuantity:parseInt(r['الحد الأقصى'])||1,category:r['التصنيف']||''})).filter((p)=>p.name); setImportData(parsed); setShowImportDialog(true); }; reader.readAsArrayBuffer(file); }} className='hidden' />
                    <Button variant='outline' size='sm' onClick={() => { if(!parts?.length)return; const d=parts.map((p)=>({'رقم القطعة':p.partNumber,'اسم القطعة':p.name,'الموديلات المتوافقة':p.compatibleModels||'','السعر':p.defaultCost,'قطعة استهلاكية':p.isConsumable?'نعم':'لا','يمكن تغير أكثر من واحدة':p.allowsMultiple?'نعم':'لا','الحد الأقصى':p.maxQuantity||1,'التصنيف':p.category||''})); const ws=XLSX.utils.json_to_sheet(d); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'قطع الغيار'); XLSX.writeFile(wb,'spare_parts.xlsx'); }} className='gap-1.5'><Download size={14} /> تصدير</Button>
                    <Button variant='success' size='sm' onClick={() => broadcastMutation.mutate({})} disabled={broadcastMutation.isPending} className='gap-1.5'><Radio size={14} /> {broadcastMutation.isPending?'جاري البث...':'بث للفروع'}</Button>
                    <Button variant='default' size='sm' onClick={() => setShowAddForm(true)} className='gap-1.5'><Plus size={14} strokeWidth={3} /> إضافة قطعة</Button>
                </div>
            </div>
            <div className='grid grid-cols-2 lg:grid-cols-5 gap-4'>
                <div className='bg-white rounded-2xl border-2 border-primary/10 p-4 shadow-sm'><p className='text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1'>إجمالي القطع</p><p className='text-2xl font-black text-primary'>{parts.length}</p></div>
                <div className='bg-white rounded-2xl border-2 border-success/20 p-4 shadow-sm'><p className='text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1'>استهلاكية</p><p className='text-2xl font-black text-success'>{parts.filter((p)=>p.isConsumable).length}</p></div>
                <div className='bg-white rounded-2xl border-2 border-purple-500/20 p-4 shadow-sm'><p className='text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1'>تعدد</p><p className='text-2xl font-black text-purple-600'>{parts.filter((p)=>p.allowsMultiple).length}</p></div>
                <div className='bg-white rounded-2xl border-2 border-primary/10 p-4 shadow-sm'><p className='text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1'>الموديلات</p><p className='text-2xl font-black text-primary'>{allModels.length}</p></div>
                <div className='bg-white rounded-2xl border-2 border-warning/20 p-4 shadow-sm'><p className='text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1'>السعر الأعلى</p><p className='text-2xl font-black text-amber-600'>{parts.length>0?Math.max(...parts.map((p)=>p.defaultCost||0)):0}</p></div>
            </div>
            <div className='bg-white rounded-2xl border-2 border-primary/10 p-4 shadow-sm'>
                <div className='flex flex-col sm:flex-row gap-3'>
                    <div className='flex-1 relative'><Search size={16} className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground' /><input type='text' placeholder='بحث بالاسم أو الكود...' value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} className='w-full border-2 border-primary/10 rounded-lg px-10 py-2.5 text-sm font-bold focus:ring-2 focus:ring-primary focus:border-primary transition-all' /></div>
                    <div className='relative w-full sm:w-56'><Briefcase size={14} className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground' /><select value={modelFilter} onChange={(e)=>setModelFilter(e.target.value)} className='w-full border-2 border-primary/10 rounded-lg px-9 py-2.5 text-sm font-bold appearance-none focus:ring-2 focus:ring-primary focus:border-primary transition-all bg-white'><option value=''>كل الموديلات</option>{allModels.map((m)=><option key={m} value={m}>{m.toUpperCase()}</option>)}</select></div>
                    {(searchTerm||modelFilter)&&<Button variant='ghost' size='sm' onClick={()=>{setSearchTerm('');setModelFilter('');}} className='gap-1.5 text-muted-foreground'><X size={14} /> مسح</Button>}
                </div>
            </div>
            <div className='bg-white rounded-2xl border-2 border-primary/10 shadow-sm overflow-hidden'>
                <div className='overflow-x-auto'><table className='w-full'><thead className='bg-muted/50 border-b-2 border-primary/10'><tr><th className='p-4 w-12'><Checkbox checked={selectedIds.size>0&&selectedIds.size===parts?.length} onCheckedChange={toggleSelectAll} className='h-5 w-5 rounded-md' /></th><th className='text-right p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground'>الكود</th><th className='text-right p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground'>اسم القطعة</th><th className='text-right p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground'>الموديلات</th><th className='text-right p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground'>السعر</th><th className='text-right p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground'>التصنيف</th><th className='text-center p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground'>إجراءات</th></tr></thead><tbody className='divide-y divide-border/50'>{filteredParts?.map((p)=><tr key={p.id} className={`hover:bg-muted/20 transition-colors ${selectedIds.has(p.id)?'bg-primary/5':''}`}><td className='p-4'><Checkbox checked={selectedIds.has(p.id)} onCheckedChange={()=>toggleSelect(p.id)} className='h-5 w-5 rounded-md' /></td><td className='p-4 font-mono font-black text-primary text-sm'>{p.partNumber||'-'}</td><td className='p-4 font-black text-foreground'>{p.name}</td><td className='p-4'><div className='flex flex-wrap gap-1'>{(p.compatibleModels||'').split(';').filter(Boolean).map((m,i)=><span key={i} className='px-2 py-0.5 bg-primary/5 text-primary border border-primary/10 rounded-full text-[10px] font-black uppercase'>{m}</span>)||'-'}</div></td><td className='p-4 font-bold text-success'>{p.defaultCost} ج.م</td><td className='p-4'><span className='px-2 py-0.5 bg-muted text-muted-foreground rounded-full text-[10px] font-black'>{p.category||'-'}</span></td><td className='p-4'><div className='flex items-center justify-center gap-1'><button onClick={()=>{setSelectedPart({...p});setShowEditForm(true);}} className='p-2 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all'><Edit size={16} /></button><button onClick={()=>{setSelectedPart(p);setShowPriceLogs(true);}} className='p-2 text-purple-500 hover:bg-purple-500/10 rounded-lg transition-all'><History size={16} /></button><button onClick={()=>{setSelectedPart(p);setShowDetailModal(true);}} className='p-2 text-green-600 hover:bg-green-600/10 rounded-lg transition-all'><Eye size={16} /></button><button onClick={()=>{if(confirm('حذف هذه القطعة من القانون نهائياً؟'))deleteMutation.mutate(p.id);}} className='p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all'><Trash2 size={16} /></button></div></td></tr>)}<tr><td colSpan={7} className='p-16 text-center'><Package size={48} className='mx-auto mb-3 text-muted-foreground/20' /><p className='font-black text-lg text-muted-foreground'>لا توجد قطع غيار</p></td></tr></tbody></table></div>
            </div>
            {showAddForm&&<PartFormModal title='إضافة قطعة غيار' initialData={newPart} onSubmit={(d)=>createMutation.mutate(d)} onClose={()=>setShowAddForm(false)} />}
            {showEditForm&&selectedPart&&<PartFormModal title='تعديل بيانات القطعة' initialData={selectedPart} onSubmit={(d)=>updateMutation.mutate({id:selectedPart.id,data:d})} onClose={()=>{setShowEditForm(false);setSelectedPart(null);}} />}
            {showPriceLogs&&selectedPart&&<PriceLogsModal partId={selectedPart.id} partName={selectedPart.name} onClose={()=>setShowPriceLogs(false)} />}
            {showDetailModal&&selectedPart&&<PartDetailModal part={selectedPart} onClose={()=>setShowDetailModal(false)} />}
            {showImportDialog&&<Modal isOpen={true} onClose={()=>{setShowImportDialog(false);setImportData([]);}} title='تأكيد استيراد البيانات' icon={<Upload size={36} className='text-primary' />}>
                <p className='text-muted-foreground mb-6'>سيتم إضافة <span className='text-foreground font-black underline decoration-primary decoration-4'>{importData.length}</span> قطعة غيار جديدة للقانون.</p>
                <div className='border border-border rounded-xl overflow-hidden mb-6'><div className='max-h-60 overflow-y-auto bg-muted/30'>{Array.isArray(importData)&&importData.map((p,i)=><div key={i} className='px-4 py-3 border-b border-border/50 last:border-0 flex justify-between items-center bg-white/50'><div><div className='font-bold text-sm'>{p.name}</div><div className='text-[10px] text-muted-foreground font-bold tracking-widest uppercase'>{p.compatibleModels}</div></div><div className='text-success font-bold text-sm'>{p.defaultCost} ج.م</div></div>)}</div></div>
                <div className='flex gap-3'>
                    <button onClick={()=>{setShowImportDialog(false);setImportData([]);}} className='flex-1 py-3 rounded-xl font-bold text-slate-400 hover:bg-slate-50 transition-all text-sm'>إلغاء</button>
                    <button onClick={()=>importMutation.mutate(importData)} className='flex-1 bg-success text-white py-3 rounded-xl font-bold hover:bg-success/80 transition-all text-sm'>تأكيد الاستيراد</button>
                </div>
            </Modal>}
        </div>
    );
}

function PartFormModal({ title, initialData, onSubmit, onClose }) {
    const [formData, setFormData] = useState({ name:'', partNumber:'', compatibleModels:'', defaultCost:0, isConsumable:false, allowsMultiple:false, maxQuantity:1, category:'', ...initialData });
    
    return (
        <Modal isOpen={true} onClose={onClose} title={title} icon={<Package size={36} className='text-primary' />}>
            <form onSubmit={(e)=>{e.preventDefault();onSubmit(formData);}} className='space-y-4'>
                <div className='space-y-2'><label className='text-[10px] font-black text-brand-primary/60 uppercase tracking-widest'>اسم القطعة</label><input value={formData.name} onChange={e=>setFormData({...formData,name:e.target.value})} className='smart-input h-12 px-5' required /></div>
                <div className='space-y-2'><label className='text-[10px] font-black text-brand-primary/60 uppercase tracking-widest'>رقم القطعة (اختياري)</label><input value={formData.partNumber||''} onChange={e=>setFormData({...formData,partNumber:e.target.value})} className='smart-input h-12 px-5 font-mono' /></div>
                <div className='space-y-2'><label className='text-[10px] font-black text-brand-primary/60 uppercase tracking-widest'>الموديلات المتوافقة</label><input placeholder='s90;d210;vx520' value={formData.compatibleModels} onChange={e=>setFormData({...formData,compatibleModels:e.target.value})} className='smart-input h-12 px-5 font-mono' /><p className='text-[10px] text-slate-400 mt-1'>افصل بين الموديلات بفاصلة منقوطة (;)</p></div>
                <div className='space-y-2'><label className='text-[10px] font-black text-brand-primary/60 uppercase tracking-widest'>السعر الرسمي (ج.م)</label><input type='number' value={formData.defaultCost} onChange={e=>setFormData({...formData,defaultCost:parseFloat(e.target.value)||0})} className='smart-input h-12 px-5 font-bold text-success' required /></div>
                <div className='space-y-2'><label className='text-[10px] font-black text-brand-primary/60 uppercase tracking-widest'>التصنيف</label><input value={formData.category||''} onChange={e=>setFormData({...formData,category:e.target.value})} className='smart-input h-12 px-5' placeholder='POS, GENERAL, etc.' /></div>
                
                {/* allowsMultiple - يمكن استخدام أكثر من قطعة في نفس الصيانة */}
                <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer ${formData.allowsMultiple?'bg-success/10 border-success/30':'bg-slate-50 border-slate-100'}`} onClick={()=>setFormData({...formData,allowsMultiple:!formData.allowsMultiple, maxQuantity:!formData.allowsMultiple ? 3 : 1})}>
                    <div className='flex items-center gap-3'><div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${formData.allowsMultiple?'bg-success text-white':'bg-slate-200 text-slate-500'}`}><Package size={18} /></div><span className='text-xs font-black text-slate-700'>يمكن تغير أكثر من قطعة</span></div>
                    <Checkbox checked={formData.allowsMultiple} onCheckedChange={(c)=>setFormData({...formData,allowsMultiple:!!c, maxQuantity:!!c ? 3 : 1})} className='h-6 w-6 rounded-lg' />
                </div>
                
                {/* maxQuantity - الحد الأقصى للقطع */}
                {formData.allowsMultiple && (
                    <div className='space-y-2'>
                        <label className='text-[10px] font-black text-brand-primary/60 uppercase tracking-widest'>الحد الأقصى للتغيير (قطعة)</label>
                        <input 
                            type='number' 
                            min='2' 
                            max='10' 
                            value={formData.maxQuantity} 
                            onChange={e=>setFormData({...formData,maxQuantity:Math.min(10, Math.max(2, parseInt(e.target.value)||1))})} 
                            className='smart-input h-12 px-5 font-bold' 
                        />
                        <p className='text-[10px] text-slate-400 mt-1'>أقصى عدد يمكن اختياره في كل صيانة</p>
                    </div>
                )}
                
                <div className='pt-4 flex gap-3'>
                    <button type='submit' className='flex-1 bg-brand-primary text-white py-3 rounded-xl font-bold hover:bg-brand-primary/90 transition-all text-sm'>حفظ</button>
                    <button type='button' onClick={onClose} className='flex-1 py-3 rounded-xl font-bold text-slate-400 hover:bg-slate-50 transition-all text-sm'>إلغاء</button>
                </div>
            </form>
        </Modal>
    );
}

function PriceLogsModal({ partId, partName, onClose }) {
    const { data: logs, isLoading } = useQuery({ queryKey: ['price-logs', partId], queryFn: () => api.get('/spare-parts/' + partId + '/price-logs') });
    const displayLogs = Array.isArray(logs) ? logs : [];
    return (
        <Modal isOpen={true} onClose={onClose} title='سجل تغييرات السعر' icon={<History size={36} className='text-purple-600' />}>
            <div className='bg-muted/50 border border-border rounded-xl p-4 mb-6'>
                <span className='text-[10px] text-muted-foreground block mb-1 font-black uppercase tracking-widest'>اسم القطعة</span>
                <span className='font-bold text-foreground'>{partName}</span>
            </div>
            {isLoading ? (
                <div className='text-center py-8 text-muted-foreground font-bold'>جاري التحميل...</div>
            ) : displayLogs.length === 0 ? (
                <div className='text-center py-8 text-muted-foreground font-bold'>لا توجد تغييرات في السعر</div>
            ) : (
                <div className='border border-border rounded-xl overflow-hidden'>
                    <div className='max-h-60 overflow-y-auto'>
                        <table className='w-full text-right text-sm'>
                            <thead className='bg-muted/50 sticky top-0 border-b border-border'>
                                <tr>
                                    <th className='px-4 py-2 text-right text-[10px] font-black uppercase text-muted-foreground'>القديم</th>
                                    <th className='px-4 py-2 text-right text-[10px] font-black uppercase text-muted-foreground'>الجديد</th>
                                    <th className='px-4 py-2 text-right text-[10px] font-black uppercase text-muted-foreground'>التاريخ</th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-border/50'>
                                {displayLogs.map((log) => (
                                    <tr key={log.id} className='hover:bg-muted/20'>
                                        <td className='px-4 py-2 text-destructive font-bold'>{log.oldCost} ج.م</td>
                                        <td className='px-4 py-2 text-success font-bold'>{log.newCost} ج.م</td>
                                        <td className='px-4 py-2 text-[10px] text-muted-foreground'>{new Date(log.changedAt).toLocaleString('ar-EG')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </Modal>
    );
}

function PartDetailModal({ part, onClose }) {
    const [branchStock, setBranchStock] = useState([]);
    const [isQuerying, setIsQuerying] = useState(false);
    const [queriedAt, setQueriedAt] = useState(null);
    const requestIdRef = useRef(`req_${Date.now()}`);
    const socketRef = useRef(null);

    const { data: priceLogs } = useQuery({ queryKey: ['price-logs', part.id], queryFn: () => api.get('/spare-parts/' + part.id + '/price-logs'), enabled: true });
    const priceLogsData = Array.isArray(priceLogs) ? priceLogs : [];

    const queryBranchStock = useCallback(async () => {
        setIsQuerying(true);
        setBranchStock([]);
        requestIdRef.current = `req_${Date.now()}`;
        try {
            const SOCKET_URL = (import.meta.env.VITE_API_URL || '').replace('/api', '') || window.location.origin;
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            const socket = socketIo(SOCKET_URL, { 
                auth: { token },
                transports: ['websocket', 'polling'], 
                reconnectionAttempts: 3, 
                reconnectionDelay: 1000 
            });
            socketRef.current = socket;
            socket.on('connect', () => { socket.emit('request_branch_stock', { partId: part.id, requestId: requestIdRef.current }); });
            socket.on('admin_branch_stock_response', (data) => {
                if (data.requestId !== requestIdRef.current) return;
                setBranchStock(prev => { const idx = prev.findIndex(b => b.branchId === data.branchId); if (idx >= 0) { const updated = [...prev]; updated[idx] = data; return updated; } return [...prev, data]; });
            });
            socket.on('connect_error', (err) => { 
                console.error('Socket connection error:', err.message);
                toast.error('فشل الاتصال للتحقق من مخزون الفروع'); 
                setIsQuerying(false); 
            });
            setTimeout(() => { if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; } setIsQuerying(false); setQueriedAt(new Date()); }, 5000);
        } catch { toast.error('فشل التحقق من مخزون الفروع'); setIsQuerying(false); }
    }, [part.id]);

    useEffect(() => { return () => { if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; } }; }, []);

    const handleExportStock = () => {
        if (!branchStock.length) return;
        const d = branchStock.map((b) => ({ 'كود الفرع': b.branchCode || '-', 'اسم الفرع': b.branchName || '-', 'الحالة': b.error ? 'غير متصل' : 'متصل', 'آخر تحديث': b.timestamp ? new Date(b.timestamp).toLocaleString('ar-EG') : '-' }));
        const ws = XLSX.utils.json_to_sheet(d);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'مخزون الفروع');
        XLSX.writeFile(wb, `${part.name}_stock_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const onlineCount = branchStock.filter(b => !b.error).length;
    const offlineCount = branchStock.filter(b => b.error).length;

    return (
        <Modal isOpen={true} onClose={onClose} title='تفاصيل قطعة الغيار' maxWidth='max-w-2xl' icon={<Eye size={36} className='text-green-600' />}>
            <div className='grid grid-cols-2 gap-3 mb-6'>
                <div className='bg-muted/50 rounded-xl p-3'><span className='text-[10px] font-black uppercase text-muted-foreground block mb-1'>الاسم</span><span className='font-bold text-sm'>{part.name}</span></div>
                <div className='bg-muted/50 rounded-xl p-3'><span className='text-[10px] font-black uppercase text-muted-foreground block mb-1'>رقم القطعة</span><span className='font-bold font-mono text-sm'>{part.partNumber || '-'}</span></div>
                <div className='bg-muted/50 rounded-xl p-3'><span className='text-[10px] font-black uppercase text-muted-foreground block mb-1'>السعر</span><span className='font-bold text-sm text-success'>{part.defaultCost} ج.م</span></div>
                <div className='bg-muted/50 rounded-xl p-3'><span className='text-[10px] font-black uppercase text-muted-foreground block mb-1'>التصنيف</span><span className='font-bold text-sm'>{part.category || '-'}</span></div>
                {part.compatibleModels && <div className='col-span-2 bg-muted/50 rounded-xl p-3'><span className='text-[10px] font-black uppercase text-muted-foreground block mb-1'>الموديلات المتوافقة</span><div className='flex flex-wrap gap-1 mt-1'>{part.compatibleModels.split(';').filter(Boolean).map((m,i)=><span key={i} className='px-2 py-0.5 bg-primary/5 text-primary border border-primary/10 rounded-full text-[10px] font-black uppercase'>{m}</span>)}</div></div>}
            </div>
            {priceLogsData.length > 0 && (
                <div className='mb-6'>
                    <h3 className='text-[10px] font-black uppercase text-muted-foreground mb-2 flex items-center gap-2'><History size={12} /> سجل الأسعار</h3>
                    <div className='border border-border rounded-xl overflow-hidden'>
                        <div className='max-h-32 overflow-y-auto'>
                            <table className='w-full text-right text-sm'>
                                <thead className='bg-muted/50 sticky top-0 border-b border-border'>
                                    <tr><th className='px-3 py-1.5 text-right text-[10px] font-black text-muted-foreground'>من</th><th className='px-3 py-1.5 text-right text-[10px] font-black text-muted-foreground'>إلى</th><th className='px-3 py-1.5 text-right text-[10px] font-black text-muted-foreground'>التاريخ</th></tr>
                                </thead>
                                <tbody className='divide-y divide-border/50'>
                                    {priceLogsData.slice(0,5).map((log)=><tr key={log.id}><td className='px-3 py-1.5 text-destructive font-bold text-xs'>{log.oldCost}</td><td className='px-3 py-1.5 text-success font-bold text-xs'>{log.newCost}</td><td className='px-3 py-1.5 text-[10px] text-muted-foreground'>{new Date(log.changedAt).toLocaleString('ar-EG')}</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            <div>
                <div className='flex items-center justify-between mb-2'>
                    <h3 className='text-[10px] font-black uppercase text-muted-foreground flex items-center gap-2'><Package size={12} /> مخزون الفروع</h3>
                    <div className='flex items-center gap-2'>
                        {isQuerying && <span className='text-[10px] text-muted-foreground flex items-center gap-1'><Loader2 size={12} className='animate-spin' /> جاري الاستعلام...</span>}
                        {queriedAt && !isQuerying && <span className='text-[10px] text-muted-foreground'>آخر استعلام: {queriedAt.toLocaleTimeString('ar-EG')}</span>}
                        {branchStock.length > 0 && <span className='text-[10px] font-black'><span className='text-green-600'>{onlineCount} متصل</span> / <span className='text-slate-400'>{offlineCount} غير متصل</span></span>}
                        <Button variant='outline' size='sm' onClick={queryBranchStock} disabled={isQuerying} className='h-7 text-[10px] gap-1'><Wifi size={12} />{isQuerying?'جاري...':'استعلام'}</Button>
                        {branchStock.length > 0 && <Button variant='outline' size='sm' onClick={handleExportStock} className='h-7 text-[10px] gap-1'><FileSpreadsheet size={12} />تصدير</Button>}
                    </div>
                </div>
                {branchStock.length === 0 && !isQuerying && <div className='border border-border rounded-xl p-8 text-center'><WifiOff size={32} className='mx-auto mb-2 text-muted-foreground/30' /><p className='text-sm font-bold text-muted-foreground'>اضغط "استعلام" للتحقق من مخزون الفروع</p></div>}
                {branchStock.length > 0 && (
                    <div className='border border-border rounded-xl overflow-hidden'>
                        <div className='max-h-64 overflow-y-auto'>
                            <table className='w-full text-right text-sm'>
                                <thead className='bg-muted/50 sticky top-0 border-b border-border'>
                                    <tr><th className='px-4 py-2 text-right text-[10px] font-black uppercase text-muted-foreground'>الفرع</th><th className='px-4 py-2 text-center text-[10px] font-black uppercase text-muted-foreground'>الحالة</th></tr>
                                </thead>
                                <tbody className='divide-y divide-border/50'>
                                    {branchStock.map((b) => (
                                        <tr key={b.branchId} className='hover:bg-muted/20'>
                                            <td className='px-4 py-2'><div className='font-bold text-sm'>{b.branchName}</div><div className='text-[10px] text-muted-foreground font-mono'>{b.branchCode}</div></td>
                                            <td className='px-4 py-2 text-center'>{b.error ? <span className='inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black'><WifiOff size={10} /> غير متصل</span> : <span className='inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-600 rounded-lg text-[10px] font-black'><Wifi size={10} /> متصل</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
