import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import adminClient from '../api/adminClient';
import { CalendarDays, FileSpreadsheet, Printer, FileDown, Building2, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '../components/ui/button';
import PageHeader from '../components/PageHeader';

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
    const [selectedMonth, setSelectedMonth] = useState(formatMonth(new Date()));
    const [selectedBranch, setSelectedBranch] = useState<string>('');
    const [activeSection, setActiveSection] = useState<'all' | 'sales' | 'installments' | 'parts' | 'inventory'>('all');
    const [isExporting, setIsExporting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);

    const { data: branchesData } = useQuery({
        queryKey: ['active-branches'],
        queryFn: () => adminClient.get('/branches/active').then(res => res.data)
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
                'الفرع': i.branchName || '-', 'الحالة': 'محصّل', 'العميل': i.customerName, 'المبلغ': i.amount,
                'تاريخ الدفع': i.paidAt ? new Date(i.paidAt).toLocaleDateString('ar-EG') : '-',
                'رقم الإيصال': i.receiptNumber || '-'
            })),
            ...(data.installments?.overdue?.details || []).map((i: any) => ({
                'الفرع': i.branchName || '-', 'الحالة': 'متأخر', 'العميل': i.customerName, 'المبلغ': i.amount,
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

            <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSyncAllBranches} 
                disabled={isSyncing}
                className="gap-2 rounded-xl text-emerald-600 border-emerald-200 hover:bg-emerald-50"
            >
                <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                <span className="hidden md:inline">سحب بيانات الفروع</span>
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
        </div>
    );

    return (
        <div className="page-container space-y-8 animate-fade-in bg-gradient-to-br from-slate-50 to-blue-50/30 min-h-screen" dir="rtl">
            <PageHeader
                title="التقفيلة المالية الشاملة"
                subtitle={`${data?.branch?.name || 'الشركة'} — ${getMonthLabel(selectedMonth)}`}
                actions={actionElements}
            />

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
        </div>
    );
}
