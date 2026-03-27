import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import adminClient from '../api/adminClient';
import { Package, Search } from 'lucide-react';
import Modal from './Modal';

export function BranchInventoryModal({ branchId, branchCode, branchName, onClose }: { branchId: string; branchCode: string; branchName: string; onClose: () => void }) {
    const [activeTab, setActiveTab] = useState<'spare-parts' | 'machines' | 'sims'>('spare-parts');
    const [searchTerm, setSearchTerm] = useState('');

    // Spare Parts (inventory items linked to this branch)
    const { data: sparePartsData } = useQuery({
        queryKey: ['branch-inventory', branchId, 'spare-parts'],
        queryFn: () => adminClient.get(`/inventory?branchId=${branchId}`).then(r => r.data),
        enabled: activeTab === 'spare-parts',
    });

    // Machines (POS machines linked to this branch)
    const { data: machinesData } = useQuery({
        queryKey: ['branch-inventory', branchId, 'machines'],
        queryFn: () => adminClient.get(`/warehouse?branchId=${branchId}`).then(r => r.data),
        enabled: activeTab === 'machines',
    });

    // SIM Cards
    const { data: simsData } = useQuery({
        queryKey: ['branch-inventory', branchId, 'sims'],
        queryFn: () => adminClient.get(`/simcards?branchId=${branchId}`).then(r => r.data),
        enabled: activeTab === 'sims',
    });

    const spareParts = Array.isArray(sparePartsData?.data) ? sparePartsData.data : (sparePartsData || []);
    const machines = Array.isArray(machinesData?.data) ? machinesData.data : (machinesData || []);
    const sims = Array.isArray(simsData?.data) ? simsData.data : (simsData || []);

    const filteredSpareParts = spareParts.filter((p: any) => !searchTerm || p.name?.includes(searchTerm) || p.partNumber?.includes(searchTerm));
    const filteredMachines = machines.filter((m: any) => !searchTerm || m.serialNumber?.includes(searchTerm) || m.model?.includes(searchTerm));
    const filteredSims = sims.filter((s: any) => !searchTerm || s.serialNumber?.includes(searchTerm) || s.type?.includes(searchTerm));

    return (
        <Modal isOpen={true} onClose={onClose} title='جرد المخزون' icon={<Package size={36} className='text-primary' />}>
            <div className='bg-muted/50 rounded-xl p-3 mb-6'>
                <span className='text-[10px] font-black uppercase text-muted-foreground block mb-1'>الفرع</span>
                <span className='font-bold'>{branchName} ({branchCode})</span>
            </div>

            <div className='flex gap-2 mb-4'>
                <button onClick={() => { setActiveTab('spare-parts'); setSearchTerm(''); }}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'spare-parts' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                    قطع الغيار
                </button>
                <button onClick={() => { setActiveTab('machines'); setSearchTerm(''); }}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'machines' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                    الأجهزة
                </button>
                <button onClick={() => { setActiveTab('sims'); setSearchTerm(''); }}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'sims' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                    شرائح البيانات
                </button>
            </div>

            <div className='relative mb-4'>
                <Search size={16} className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground' />
                <input type='text' placeholder='بحث...' value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className='w-full border-2 border-primary/10 rounded-lg px-10 py-2.5 text-sm font-bold focus:ring-2 focus:ring-primary focus:border-primary transition-all' />
            </div>

            {activeTab === 'spare-parts' && (
                <div className='border border-border rounded-xl overflow-hidden'>
                    <div className='max-h-64 overflow-y-auto'>
                        <table className='w-full text-right text-sm'>
                            <thead className='bg-muted/50 sticky top-0 border-b border-border'>
                                <tr>
                                    <th className='px-3 py-2 text-right text-[10px] font-black uppercase text-muted-foreground'>الاسم</th>
                                    <th className='px-3 py-2 text-right text-[10px] font-black uppercase text-muted-foreground'>الكمية</th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-border/50'>
                                {filteredSpareParts.length === 0 ? (
                                    <tr><td colSpan={2} className='px-4 py-8 text-center text-muted-foreground font-bold'>لا توجد بيانات</td></tr>
                                ) : filteredSpareParts.map((p: any) => (
                                    <tr key={p.id} className='hover:bg-muted/20'>
                                        <td className='px-3 py-2 font-bold'>{p.name}</td>
                                        <td className='px-3 py-2 font-bold text-primary'>{p.quantity || 0}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'machines' && (
                <div className='border border-border rounded-xl overflow-hidden'>
                    <div className='max-h-64 overflow-y-auto'>
                        <table className='w-full text-right text-sm'>
                            <thead className='bg-muted/50 sticky top-0 border-b border-border'>
                                <tr>
                                    <th className='px-3 py-2 text-right text-[10px] font-black uppercase text-muted-foreground'>السيريال</th>
                                    <th className='px-3 py-2 text-right text-[10px] font-black uppercase text-muted-foreground'>الموديل</th>
                                    <th className='px-3 py-2 text-right text-[10px] font-black uppercase text-muted-foreground'>الحالة</th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-border/50'>
                                {filteredMachines.length === 0 ? (
                                    <tr><td colSpan={3} className='px-4 py-8 text-center text-muted-foreground font-bold'>لا توجد أجهزة</td></tr>
                                ) : filteredMachines.map((m: any) => (
                                    <tr key={m.id} className='hover:bg-muted/20'>
                                        <td className='px-3 py-2 font-mono font-bold'>{m.serialNumber}</td>
                                        <td className='px-3 py-2'>{m.model || '-'}</td>
                                        <td className='px-3 py-2'><span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${m.status === 'NEW' ? 'bg-success/10 text-success' : 'bg-amber-100 text-amber-700'}`}>{m.status}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'sims' && (
                <div className='border border-border rounded-xl overflow-hidden'>
                    <div className='max-h-64 overflow-y-auto'>
                        <table className='w-full text-right text-sm'>
                            <thead className='bg-muted/50 sticky top-0 border-b border-border'>
                                <tr>
                                    <th className='px-3 py-2 text-right text-[10px] font-black uppercase text-muted-foreground'>السيريال</th>
                                    <th className='px-3 py-2 text-right text-[10px] font-black uppercase text-muted-foreground'>النوع</th>
                                    <th className='px-3 py-2 text-right text-[10px] font-black uppercase text-muted-foreground'>الحالة</th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-border/50'>
                                {filteredSims.length === 0 ? (
                                    <tr><td colSpan={3} className='px-4 py-8 text-center text-muted-foreground font-bold'>لا توجد شرائح</td></tr>
                                ) : filteredSims.map((s: any) => (
                                    <tr key={s.id} className='hover:bg-muted/20'>
                                        <td className='px-3 py-2 font-mono font-bold'>{s.serialNumber}</td>
                                        <td className='px-3 py-2'>{s.type || '-'}</td>
                                        <td className='px-3 py-2'><span className='px-2 py-0.5 rounded-full text-[10px] font-black bg-primary/10 text-primary'>{s.status || 'NEW'}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className='flex gap-3 pt-4'>
                <button onClick={onClose} className='flex-1 py-3 rounded-xl font-bold text-slate-400 hover:bg-slate-50 transition-all text-sm'>إغلاق</button>
            </div>
        </Modal>
    );
}
