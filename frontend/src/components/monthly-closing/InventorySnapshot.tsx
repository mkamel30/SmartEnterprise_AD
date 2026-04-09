import { useState } from 'react';
import { Package, Smartphone, ArrowUpRight, ArrowDownRight, Wrench, ChevronDown, ChevronUp } from 'lucide-react';

interface MachineBreakdown { status: string; count: number }
interface SimBreakdown { type: string; status: string; count: number }
interface MachineDetail { serialNumber: string; model: string | null; manufacturer: string | null; status: string }
interface SimDetail { serialNumber: string; type: string | null; networkType: string | null; status: string }
interface SparePartItem { partName: string; partNumber: string; quantity: number; unitCost: number; category: string }

interface InventoryProps {
    inventory: {
        machines: number;
        machineBreakdown?: MachineBreakdown[];
        machineDetails?: MachineDetail[];
        sims: number;
        simBreakdown?: SimBreakdown[];
        simDetails?: SimDetail[];
        spareParts?: SparePartItem[];
        sparePartsTotal?: number;
        outgoingTransfers: number;
        incomingTransfers: number;
    } | undefined;
}

const statusLabels: Record<string, string> = {
    NEW: 'جديد',
    IN_STOCK: 'بالمخزن',
    STANDBY: 'احتياطي',
    DEFECTIVE: 'معطلة',
    CLIENT_REPAIR: 'صيانة عميل',
    REPAIRED: 'تم الإصلاح',
    ACTIVE: 'نشط',
    SOLD: 'تم البيع',
    USED: 'مستخدم'
};

const fmt = (val: number) => val?.toLocaleString('ar-EG') || '0';

export function InventorySnapshot({ inventory }: InventoryProps) {
    const [showMachines, setShowMachines] = useState(false);
    const [showSims, setShowSims] = useState(false);
    const [showParts, setShowParts] = useState(false);

    if (!inventory) return null;

    const machineBreakdown = inventory.machineBreakdown || [];
    const simBreakdown = inventory.simBreakdown || [];
    const machineDetails = inventory.machineDetails || [];
    const simDetails = inventory.simDetails || [];
    const spareParts = (inventory.spareParts || []).filter(sp => sp.quantity > 0);
    const sparePartsTotal = inventory.sparePartsTotal || spareParts.reduce((sum, sp) => sum + sp.quantity, 0);
    const uniquePartTypes = spareParts.length;

    const simTypes = [...new Set(simBreakdown.map(s => s.type))];

    return (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6 animate-fade-in">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                    <Package size={24} />
                </div>
                <h2 className="text-xl font-black text-slate-800">حالة المخزون</h2>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="border rounded-2xl p-5 text-center bg-indigo-50 text-indigo-600 border-indigo-100">
                    <div className="flex justify-center mb-3"><Package size={22} /></div>
                    <p className="text-3xl font-black">{fmt(inventory.machines)}</p>
                    <p className="text-sm font-bold mt-1">ماكينات بالمخزن</p>
                </div>
                <div className="border rounded-2xl p-5 text-center bg-emerald-50 text-emerald-600 border-emerald-100">
                    <div className="flex justify-center mb-3"><Smartphone size={22} /></div>
                    <p className="text-3xl font-black">{fmt(inventory.sims)}</p>
                    <p className="text-sm font-bold mt-1">شرائح بالمخزن</p>
                </div>
                <div className="border rounded-2xl p-5 text-center bg-amber-50 text-amber-600 border-amber-100">
                    <div className="flex justify-center mb-3"><Wrench size={22} /></div>
                    <p className="text-3xl font-black">{fmt(sparePartsTotal)}</p>
                    <p className="text-sm font-bold mt-1">قطع غيار ({uniquePartTypes} نوع)</p>
                </div>
                <div className="border rounded-2xl p-5 text-center bg-blue-50 text-blue-600 border-blue-100">
                    <div className="flex justify-center mb-3"><ArrowUpRight size={22} /></div>
                    <p className="text-3xl font-black">{fmt(inventory.outgoingTransfers + inventory.incomingTransfers)}</p>
                    <p className="text-sm font-bold mt-1">تحويلات (صادر {inventory.outgoingTransfers} / وارد {inventory.incomingTransfers})</p>
                </div>
            </div>

            {/* Machine Breakdown */}
            {machineBreakdown.length > 0 && (
                <div className="space-y-3">
                    <button
                        onClick={() => setShowMachines(!showMachines)}
                        className="flex items-center gap-2 text-sm font-bold text-indigo-700 hover:text-indigo-900 transition-colors w-full"
                    >
                        <Package size={16} />
                        تفاصيل الماكينات حسب الحالة
                        {showMachines ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <div className="flex flex-wrap gap-3">
                        {machineBreakdown.map(b => (
                            <div key={b.status} className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2 text-center min-w-[100px]">
                                <p className="text-2xl font-black text-indigo-700">{b.count}</p>
                                <p className="text-xs font-bold text-indigo-600">{statusLabels[b.status] || b.status}</p>
                            </div>
                        ))}
                    </div>
                    {showMachines && machineDetails.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-600">
                                        <th className="text-right py-2 px-3 rounded-tr-xl">المسلسل</th>
                                        <th className="text-right py-2 px-3">الموديل</th>
                                        <th className="text-right py-2 px-3">الشركة</th>
                                        <th className="text-right py-2 px-3 rounded-tl-xl">الحالة</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {machineDetails.slice(0, 50).map((m, i) => (
                                        <tr key={i} className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-mono text-xs">{m.serialNumber}</td>
                                            <td className="py-2 px-3 font-bold">{m.model || '-'}</td>
                                            <td className="py-2 px-3">{m.manufacturer || '-'}</td>
                                            <td className="py-2 px-3">
                                                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                                                    {statusLabels[m.status] || m.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {machineDetails.length > 50 && (
                                        <tr><td colSpan={4} className="py-2 px-3 text-center text-slate-400 text-xs">+{machineDetails.length - 50} المزيد</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* SIM Breakdown */}
            {simBreakdown.length > 0 && (
                <div className="space-y-3">
                    <button
                        onClick={() => setShowSims(!showSims)}
                        className="flex items-center gap-2 text-sm font-bold text-emerald-700 hover:text-emerald-900 transition-colors w-full"
                    >
                        <Smartphone size={16} />
                        تفاصيل الشرائح حسب النوع والحالة
                        {showSims ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <div className="flex flex-wrap gap-3">
                        {simTypes.map(type => {
                            const typeItems = simBreakdown.filter(s => s.type === type);
                            const typeTotal = typeItems.reduce((sum, s) => sum + s.count, 0);
                            return (
                                <div key={type} className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2 min-w-[120px]">
                                    <p className="text-xs font-bold text-emerald-600 mb-1">{type || 'غير محدد'}</p>
                                    <p className="text-2xl font-black text-emerald-700">{typeTotal}</p>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {typeItems.map(s => (
                                            <span key={s.status} className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                                                {statusLabels[s.status] || s.status}: {s.count}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {showSims && simDetails.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-600">
                                        <th className="text-right py-2 px-3 rounded-tr-xl">المسلسل</th>
                                        <th className="text-right py-2 px-3">النوع</th>
                                        <th className="text-right py-2 px-3">شبكة</th>
                                        <th className="text-right py-2 px-3 rounded-tl-xl">الحالة</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {simDetails.slice(0, 50).map((s, i) => (
                                        <tr key={i} className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-mono text-xs">{s.serialNumber}</td>
                                            <td className="py-2 px-3 font-bold">{s.type || '-'}</td>
                                            <td className="py-2 px-3">{s.networkType || '-'}</td>
                                            <td className="py-2 px-3">
                                                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                                                    {statusLabels[s.status] || s.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {simDetails.length > 50 && (
                                        <tr><td colSpan={4} className="py-2 px-3 text-center text-slate-400 text-xs">+{simDetails.length - 50} المزيد</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Spare Parts */}
            {spareParts.length > 0 && (
                <div className="space-y-3">
                    <button
                        onClick={() => setShowParts(!showParts)}
                        className="flex items-center gap-2 text-sm font-bold text-amber-700 hover:text-amber-900 transition-colors w-full"
                    >
                        <Wrench size={16} />
                        قطع الغيار ({uniquePartTypes} نوع — {fmt(sparePartsTotal)} قطعة)
                        {showParts ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {showParts && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-amber-50 text-amber-700">
                                        <th className="text-right py-2 px-3 rounded-tr-xl">اسم القطعة</th>
                                        <th className="text-right py-2 px-3">الكود</th>
                                        <th className="text-right py-2 px-3">الكمية</th>
                                        <th className="text-right py-2 px-3 rounded-tl-xl">سعر الوحدة</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {spareParts.map((sp, i) => (
                                        <tr key={i} className="border-b border-slate-100">
                                            <td className="py-2 px-3 font-bold">{sp.partName}</td>
                                            <td className="py-2 px-3 font-mono text-xs text-slate-500">{sp.partNumber}</td>
                                            <td className="py-2 px-3 font-bold text-amber-700">{sp.quantity}</td>
                                            <td className="py-2 px-3">{fmt(sp.unitCost)} ج.م</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}