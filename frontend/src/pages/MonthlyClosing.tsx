import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import adminClient from '../api/adminClient';
import { CalendarDays, FileSpreadsheet, Printer, FileDown, Building2, RefreshCw, Send, CheckCircle, Clock, Trash2, History, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '../components/ui/button';
import PageHeader from '../components/PageHeader';
import * as Dialog from '@radix-ui/react-dialog';

// Section Components
import { SalesSummary } from '../components/monthly-closing/SalesSummary';
import { InstallmentsSummary } from '../components/monthly-closing/InstallmentsSummary';
import { SparePartsSummary } from '../components/monthly-closing/SparePartsSummary';
import { InventorySnapshot } from '../components/monthly-closing/InventorySnapshot';
import { OverallSummary } from '../components/monthly-closing/OverallSummary';
import { ChildBranchReport } from '../components/monthly-closing/ChildBranchReport';

// Helpers
const formatMonth = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
};

const getMonthLabel = (month: string) => {
    const [y, m] = month.split('-');
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    return `${months[parseInt(m) - 1]} ${y}`;
};

export default function MonthlyClosing() {
    const queryClient = useQueryClient();
    const [selectedMonth, setSelectedMonth] = useState(formatMonth(new Date()));
    const [selectedBranch, setSelectedBranch] = useState<string>('');
    const [activeSection, setActiveSection] = useState<'all' | 'sales' | 'installments' | 'parts' | 'inventory'>('all');
    const [isExporting, setIsExporting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedVersionId, setSelectedVersionId] = useState<string>('');
    const [showVersionDialog, setShowVersionDialog] = useState(false);
    const [showFlushConfirm, setShowFlushConfirm] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);

    const { data: branchesData } = useQuery({
        queryKey: ['active-branches'],
        queryFn: () => adminClient.get('/branches/active').then(res => res.data)
    });

    const { data: branchesStatus } = useQuery({
        queryKey: ['monthly-closing-branches-status', selectedMonth],
        queryFn: () => adminClient.get(`/reports/monthly-closing/branches-status?month=${selectedMonth}`).then(res => res.data),
    });

    const { data, isLoading, error } = useQuery({
        queryKey: ['monthly-closing', selectedMonth, selectedBranch],
        queryFn: () => adminClient.get('/reports/monthly-closing', { 
            params: { month: selectedMonth, branchId: selectedBranch || undefined }
        }).then(res => res.data),
        enabled: !!selectedMonth
    });

    const handleSyncAllBranches = async () => {
        setIsSyncing(true);
        try {
            const res = await adminClient.post('/sync/request-all-report-sync');
            if (res.data.results) {
                const onlineCount = res.data.results.filter((r: any) => r.status === 'REQUESTED').length;
                toast.success(`تم إرسال طلب سحب البيانات لـ ${onlineCount} فروع متصلة`);
            }
        } catch (err) {
            toast.error('فشل في إرسال طلب السحب');
        } finally {
            setIsSyncing(false);
        }
    };

    const requestMonthlyClosing = useMutation({
        mutationFn: () => adminClient.post('/sync/request-all-monthly-closing', { month: selectedMonth, sections: 'all' }),
        onSuccess: (res: any) => {
            const requested = res.data?.results?.filter((r: any) => r.status === 'REQUESTED')?.length || 0;
            toast.success(`تم طلب تقرير التقفيلة لشهر ${getMonthLabel(selectedMonth)} من ${requested} فروع`);
            queryClient.invalidateQueries({ queryKey: ['monthly-closing-branches-status', selectedMonth] });
        },
        onError: () => {
            toast.error('فشل في طلب تقرير التقفيلة');
        }
    });

    const updateSyncMode = useMutation({
        mutationFn: ({ branchId, mode }: { branchId: string; mode: string }) =>
            adminClient.put(`/branches/${branchId}`, { reportSyncMode: mode }),
        onSuccess: () => {
            toast.success('تم تحديث وضع المزامنة');
            queryClient.invalidateQueries({ queryKey: ['monthly-closing-branches-status', selectedMonth] });
        },
        onError: () => {
            toast.error('فشل في تحديث وضع المزامنة');
        }
    });

    const flushMonthlyClosing = useMutation({
        mutationFn: () => adminClient.delete('/reports/monthly-closing/flush', { 
            params: { month: selectedMonth } 
        }),
        onSuccess: (res: any) => {
            toast.success(`تم مسح ${res.data?.deletedReports || 0} تقارير و ${res.data?.deletedLogs || 0} سجلات`);
            queryClient.invalidateQueries({ queryKey: ['monthly-closing', selectedMonth] });
            queryClient.invalidateQueries({ queryKey: ['monthly-closing-versions', selectedMonth] });
            queryClient.invalidateQueries({ queryKey: ['monthly-closing-branches-status', selectedMonth] });
        },
        onError: () => {
            toast.error('فشل في مسح التقارير');
        }
    });

    const deleteVersion = useMutation({
        mutationFn: (versionId: string) => adminClient.delete(`/reports/monthly-closing/${versionId}`),
        onSuccess: () => {
            toast.success('تم حذف الإصدار');
            queryClient.invalidateQueries({ queryKey: ['monthly-closing', selectedMonth] });
            queryClient.invalidateQueries({ queryKey: ['monthly-closing-versions', selectedMonth] });
        },
        onError: () => {
            toast.error('فشل في حذف الإصدار');
        }
    });

    // Get list of versions for the selected month
    const { data: versionsData } = useQuery({
        queryKey: ['monthly-closing-versions', selectedMonth],
        queryFn: () => adminClient.get(`/reports/monthly-closing/versions?month=${selectedMonth}`).then(res => res.data),
        enabled: !!selectedMonth
    });

    // Month navigation
    const navigateMonth = (dir: number) => {
        const [y, m] = selectedMonth.split('-').map(Number);
        const d = new Date(y, m - 1 + dir, 1);
        setSelectedMonth(formatMonth(d));
    };

    const sections = [
        { key: 'all', label: 'عرض شامل' },
        { key: 'sales', label: '💰 المبيعات' },
        { key: 'installments', label: '📅 الأقساط' },
        { key: 'parts', label: '🔧 قطع الغيار' },
        { key: 'inventory', label: '📦 المخزون' }
    ];

    // =========== EXPORT TO EXCEL ===========
    const handleExportExcel = async () => {
        if (!data) return;
        const XLSX = await import('xlsx');
        const wb = XLSX.utils.book_new();

        // Summary sheet
        const summaryRows = [
            { 'البند': 'إجمالي إيرادات الشهر', 'القيمة (ج.م)': data.summary?.totalMonthlyRevenue || 0 },
            { 'البند': 'إجمالي المبيعات', 'القيمة (ج.م)': data.summary?.totalSalesValue || 0 },
            { 'البند': 'الأقساط المتأخرة', 'القيمة (ج.م)': data.summary?.totalOverdueAmount || 0 },
            { 'البند': 'قطع غيار بمقابل', 'القيمة (ج.م)': data.summary?.totalPaidParts || 0 },
            { 'البند': 'قطع غيار ضمان', 'القيمة (ج.م)': data.summary?.totalFreeParts || 0 },
            { 'البند': 'إجمالي قيمة قطع الغيار', 'القيمة (ج.م)': data.summary?.totalPartsValue || 0 },
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'الملخص العام');

        // Sales sheet
        const salesRows = [
            ...(data.sales?.cash?.details || []).map((s: any) => ({
                'الفرع': s.branchName || '-', 'النوع': 'كاش', 'المسلسل': s.serialNumber, 'العميل': s.customerName,
                'كود العميل': s.customerCode, 'التاريخ': new Date(s.saleDate).toLocaleDateString('ar-EG'),
                'الإجمالي': s.totalPrice, 'المدفوع': s.paidAmount, 'الحالة': s.status
            })),
            ...(data.sales?.installment?.details || []).map((s: any) => ({
                'الفرع': s.branchName || '-', 'النوع': 'قسط', 'المسلسل': s.serialNumber, 'العميل': s.customerName,
                'كود العميل': s.customerCode, 'التاريخ': new Date(s.saleDate).toLocaleDateString('ar-EG'),
                'الإجمالي': s.totalPrice, 'المدفوع': s.paidAmount, 'الحالة': s.status
            }))
        ];
        if (salesRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesRows), 'المبيعات');

        // Installments sheet
        const installRows = [
            ...(data.installments?.collected?.details || []).map((i: any) => ({
                'الفرع': i.branchName || '-', 'الحالة': 'محصّل', 'العميل': i.customerName, 'كود العميل': i.customerCode, 'المبلغ': i.amount,
                'تاريخ الدفع': i.paidAt ? new Date(i.paidAt).toLocaleDateString('ar-EG') : '-',
                'رقم الإيصال': i.receiptNumber || '-'
            })),
            ...(data.installments?.overdue?.details || []).map((i: any) => ({
                'الفرع': i.branchName || '-', 'الحالة': 'متأخر', 'العميل': i.customerName, 'كود العميل': i.customerCode, 'المبلغ': i.amount,
                'تاريخ الاستحقاق': new Date(i.dueDate).toLocaleDateString('ar-EG'),
                'أيام التأخير': i.daysOverdue
            }))
        ];
        if (installRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(installRows), 'الأقساط');

        // Spare Parts - Paid sheet
        const paidPartsRows = (data.spareParts?.paid?.details || []).map((p: any) => ({
            'الفرع': p.branchName || '-', 'القطعة': p.partName, 'الكمية': p.quantity, 'سعر الوحدة': p.unitCost,
            'الإجمالي': p.totalValue, 'العميل': p.customerName,
            'التاريخ': new Date(p.closedAt).toLocaleDateString('ar-EG'),
            'رقم الإيصال': p.receiptNumber || '-'
        }));
        if (paidPartsRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paidPartsRows), 'قطع غيار بمقابل');

        XLSX.writeFile(wb, `تقرير_اقفال_الشركة_${selectedMonth}.xlsx`);
    };

    // =========== EXPORT TO PDF ===========
    const handleExportPDF = async () => {
        if (!reportRef.current) return;
        setIsExporting(true);
        try {
            const prevSection = activeSection;
            setActiveSection('all');
            await new Promise(resolve => setTimeout(resolve, 500));

            const html2canvas = ((await import('html2canvas')) as any).default;
            const jsPDF = ((await import('jspdf')) as any).default;
            const element = reportRef.current;
            const canvas = await html2canvas(element, {
                scale: 2, useCORS: true, backgroundColor: '#f8fafc',
                width: element.scrollWidth, height: element.scrollHeight,
                windowWidth: element.scrollWidth, windowHeight: element.scrollHeight
            });

            const imgData = canvas.toDataURL('image/png');
            const imgWidth = 210; const pageHeight = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            const pdf = new jsPDF('p', 'mm', 'a4');
            let heightLeft = imgHeight; let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            while (heightLeft > 0) {
                position = -(imgHeight - heightLeft);
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }
            pdf.save(`تقرير_اقفال_${selectedMonth}.pdf`);
            setActiveSection(prevSection);
        } catch (err) {
            console.error('PDF export failed:', err);
        } finally {
            setIsExporting(false);
        }
    };

    const handlePrint = () => window.print();

    if (isLoading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 border-4 border-[var(--color-navy)] border-t-[var(--color-gold)] rounded-full animate-spin mx-auto"></div>
                    <p className="text-slate-500 font-bold animate-pulse">جاري تجميع بيانات إقفال الشركة...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="text-center space-y-4">
                    <p className="text-red-500 font-bold text-xl">حدث خطأ أثناء تحميل التقرير</p>
                    <p className="text-slate-400">حاول مرة أخرى لاحقاً</p>
                </div>
            </div>
        );
    }

    const actionElements = (
        <div className="flex items-center gap-3">
            {/* Branch Picker */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-3 py-2 shadow-sm">
                <Building2 size={16} className="text-[var(--color-navy)]" />
                <select 
                    value={selectedBranch} 
                    onChange={e => setSelectedBranch(e.target.value)}
                    className="bg-transparent border-none outline-none text-slate-700 font-bold text-sm cursor-pointer pr-2"
                >
                    <option value="">إجمالي فروع الشركة (الكل)</option>
                    {branchesData?.map((b: any) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>
            </div>

            {/* Month Picker */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-2 shadow-sm">
                <button onClick={() => navigateMonth(-1)} className="text-slate-400 hover:text-[var(--color-navy)] transition-colors font-bold text-lg px-1">→</button>
                <div className="flex items-center gap-2 min-w-[140px] justify-center">
                    <CalendarDays size={18} className="text-[var(--color-navy)]" />
                    <span className="font-black text-slate-700">{getMonthLabel(selectedMonth)}</span>
                </div>
                <button onClick={() => navigateMonth(1)} className="text-slate-400 hover:text-[var(--color-navy)] transition-colors font-bold text-lg px-1">←</button>
            </div>

            <Button variant="outline" size="sm" onClick={handleSyncAllBranches} disabled={isSyncing} className="gap-2 rounded-xl text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                <span className="hidden md:inline">سحب بيانات</span>
            </Button>

            <Button size="sm" onClick={() => requestMonthlyClosing.mutate()} disabled={requestMonthlyClosing.isPending} className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                {requestMonthlyClosing.isPending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                <span className="hidden md:inline">طلب تقفيلة شهرية</span>
            </Button>

            <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-2 rounded-xl">
                <FileSpreadsheet size={16} />
                <span className="hidden md:inline">إكسيل</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isExporting} className="gap-2 rounded-xl">
                <FileDown size={16} />
                <span className="hidden md:inline">{isExporting ? 'جاري...' : 'PDF'}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2 rounded-xl print:hidden">
                <Printer size={16} />
                <span className="hidden md:inline">طباعة</span>
            </Button>

            {/* Version History Button */}
            <Button variant="outline" size="sm" onClick={() => setShowVersionDialog(true)} className="gap-2 rounded-xl text-amber-600 border-amber-200 hover:bg-amber-50">
                <History size={16} />
                <span className="hidden md:inline">السوابق</span>
            </Button>

            {/* Flush Button */}
            <Button variant="outline" size="sm" onClick={() => setShowFlushConfirm(true)} className="gap-2 rounded-xl text-red-600 border-red-200 hover:bg-red-50">
                <Trash2 size={16} />
                <span className="hidden md:inline">مسح</span>
            </Button>
        </div>
    );

    // Version selector dialog
    const versionSelector = (
        <Dialog.Root open={showVersionDialog} onOpenChange={setShowVersionDialog}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 w-full max-w-lg z-50 shadow-2xl max-h-[80vh] overflow-y-auto">
                    <Dialog.Title className="text-xl font-black text-slate-800 mb-4">سجل التقارير السابقة</Dialog.Title>
                    <Dialog.Description className="text-sm text-slate-500 mb-4">
                        اختر إصداراً واحداً للمقارنة أو احذف غير Needed
                    </Dialog.Description>
                    <div className="space-y-3">
                        {versionsData?.allVersions?.length === 0 ? (
                            <p className="text-center text-slate-400 py-8">لا توجد إصدارات سابقة</p>
                        ) : (
                            versionsData?.allVersions?.map((v: any) => (
                                <div key={v.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                    <div>
                                        <p className="font-bold text-slate-700">{v.branchName}</p>
                                        <p className="text-xs text-slate-400">
                                            {v.receivedAt ? new Date(v.receivedAt).toLocaleString('ar-EG') : 'غير محدد'}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => {
                                            setSelectedVersionId(v.id);
                                            setShowVersionDialog(false);
                                        }} className="text-blue-600">
                                            عرض
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => deleteVersion.mutate(v.id)} className="text-red-600">
                                            <Trash2 size={14} />
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <Dialog.Close className="mt-4 w-full py-2 bg-slate-100 rounded-xl font-bold text-slate-600">إغلاق</Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );

    // Flush confirmation dialog
    const flushConfirmDialog = (
        <Dialog.Root open={showFlushConfirm} onOpenChange={setShowFlushConfirm}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 w-full max-w-sm z-50 shadow-2xl">
                    <Dialog.Title className="text-xl font-black text-red-600 mb-4">تأكيد المسح</Dialog.Title>
                    <Dialog.Description className="text-sm text-slate-500 mb-4">
                        سيتم مسح جميع تقارير التقفيلة لشهر {getMonthLabel(selectedMonth)}. لا يمكن التراجع عن هذا الإجراء!
                    </Dialog.Description>
                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setShowFlushConfirm(false)}>إلغاء</Button>
                        <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => {
                            flushMonthlyClosing.mutate();
                            setShowFlushConfirm(false);
                        }}>تأكيد المسح</Button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );

    return (
        <div className="page-container space-y-8 animate-fade-in bg-gradient-to-br from-slate-50 to-blue-50/30 min-h-screen" dir="rtl">
            <PageHeader
                title="التقفيلة المالية الشاملة"
                subtitle={`${data?.branch?.name || 'الشركة'} — ${getMonthLabel(selectedMonth)}`}
                actions={actionElements}
            />
            {versionSelector}
            {flushConfirmDialog}

            {/* Section Tabs */}
            <div className="flex flex-wrap items-center gap-2 bg-white/80 backdrop-blur-sm p-2 rounded-2xl border border-slate-200 shadow-sm print:hidden">
                {sections.map(s => (
                    <button
                        key={s.key}
                        onClick={() => setActiveSection(s.key as any)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeSection === s.key
                            ? 'bg-[#0A2472] text-white shadow-md'
                            : 'text-slate-500 hover:bg-slate-100'
                            }`}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            {/* Report Content (ref for PDF capture) */}
            <div ref={reportRef} className="space-y-8">
                {/* Overall Summary */}
                {(activeSection === 'all') && <OverallSummary summary={data?.summary} />}

                {/* Sections */}
                {(activeSection === 'all' || activeSection === 'sales') && (
                    <SalesSummary sales={data?.sales} />
                )}
                {(activeSection === 'all' || activeSection === 'installments') && (
                    <InstallmentsSummary installments={data?.installments} />
                )}
                {(activeSection === 'all' || activeSection === 'parts') && (
                    <SparePartsSummary spareParts={data?.spareParts} />
                )}
                {(activeSection === 'all' || activeSection === 'inventory') && (
                    <InventorySnapshot inventory={data?.inventory} />
                )}

                {/* Child Branches Breakdown */}
                {data?.hasChildBranches && data?.childBranches?.length > 0 && (
                    <ChildBranchReport childBranches={data.childBranches} month={selectedMonth} />
                )}
            </div>

            {/* Branch Report Status */}
            {branchesStatus?.branches && branchesStatus.branches.length > 0 && (
                <div className="bg-white rounded-2xl p-6 border-2 border-primary/10 shadow-sm">
                    <h3 className="text-lg font-black text-primary mb-4">حالة تقارير الفروع لشهر {getMonthLabel(selectedMonth)}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {branchesStatus.branches.map((b: any) => (
                            <div key={b.id} className={`flex items-center gap-3 p-3 rounded-xl border ${b.reportStatus === 'RECEIVED' ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                                {b.reportStatus === 'RECEIVED' 
                                    ? <CheckCircle size={20} className="text-green-600 shrink-0" />
                                    : <Clock size={20} className="text-amber-500 shrink-0" />
                                }
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-slate-800 truncate">{b.name}</p>
                                    <p className="text-xs text-slate-500">
                                        {b.reportStatus === 'RECEIVED' 
                                            ? `تم الاستلام ${b.receivedAt ? new Date(b.receivedAt).toLocaleDateString('ar-EG') : ''}`
                                            : 'بانتظار التقرير'
                                        }
                                    </p>
                                </div>
                                <select
                                    value={b.reportSyncMode || 'PULL'}
                                    onChange={(e) => updateSyncMode.mutate({ branchId: b.id, mode: e.target.value })}
                                    className="text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-600 cursor-pointer hover:border-primary/30 transition-colors"
                                >
                                    <option value="PULL">سحب تلقائي</option>
                                    <option value="REQUEST">طلب تأكيد</option>
                                </select>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
