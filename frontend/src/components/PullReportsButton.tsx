import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import adminClient from '../api/adminClient';
import toast from 'react-hot-toast';

interface PullReportsButtonProps {
    branches: any[];
    onSuccess?: () => void;
}

interface SyncStatus {
    branchId: string;
    branchName: string;
    status: 'idle' | 'pulling' | 'success' | 'error';
    message: string;
}

export default function PullReportsButton({ branches, onSuccess }: PullReportsButtonProps) {
    const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);
    const [isPulling, setIsPulling] = useState(false);
    const [showStatus, setShowStatus] = useState(false);

    const { refetch: _refetchBranches } = useQuery({
        queryKey: ['branches-list'],
        queryFn: () => adminClient.get('/branches').then(r => r.data),
        enabled: false
    });

    const handlePullAll = async () => {
        if (!branches || branches.length === 0) {
            toast.error('لا توجد فروع لسحب البيانات منها');
            return;
        }

        setIsPulling(true);
        setShowStatus(true);

        const statuses: SyncStatus[] = branches.map(b => ({
            branchId: b.id,
            branchName: b.name,
            status: 'idle',
            message: 'في الانتظار'
        }));
        setSyncStatuses(statuses);

        for (let i = 0; i < branches.length; i++) {
            const branch = branches[i];

            setSyncStatuses(prev => prev.map((s, idx) =>
                idx === i ? { ...s, status: 'pulling', message: 'جاري سحب البيانات...' } : s
            ));

            try {
                await adminClient.post(`/branches/${branch.id}/pull-reports`);

                setSyncStatuses(prev => prev.map((s, idx) =>
                    idx === i ? { ...s, status: 'success', message: 'تم سحب البيانات بنجاح' } : s
                ));

                toast.success(`تم سحب بيانات ${branch.name}`);
            } catch (error: any) {
                const msg = error.response?.data?.error || 'فشل في سحب البيانات';
                setSyncStatuses(prev => prev.map((s, idx) =>
                    idx === i ? { ...s, status: 'error', message: msg } : s
                ));
                toast.error(`فشل سحب بيانات ${branch.name}: ${msg}`);
            }

            if (i < branches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        setIsPulling(false);
        if (onSuccess) onSuccess();
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pulling': return <Loader2 size={14} className="animate-spin text-blue-500" />;
            case 'success': return <CheckCircle size={14} className="text-green-500" />;
            case 'error': return <XCircle size={14} className="text-red-500" />;
            default: return <AlertCircle size={14} className="text-slate-400" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pulling': return 'text-blue-600';
            case 'success': return 'text-green-600';
            case 'error': return 'text-red-600';
            default: return 'text-slate-400';
        }
    };

    return (
        <div className="relative">
            <button
                onClick={handlePullAll}
                disabled={isPulling}
                className={`
                    flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-sm transition-all
                    ${isPulling 
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-200 cursor-wait' 
                        : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 active:scale-95'}
                `}
            >
                {isPulling ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {isPulling ? 'جاري السحب...' : 'سحب البيانات'}
            </button>

            {showStatus && syncStatuses.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="p-3 border-b border-slate-100 bg-slate-50">
                        <h4 className="text-xs font-black text-slate-700 uppercase">حالة المزامنة</h4>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                        {syncStatuses.map((s, idx) => (
                            <div key={s.branchId} className={`flex items-center gap-3 px-4 py-3 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} border-b border-slate-50 last:border-0`}>
                                {getStatusIcon(s.status)}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">{s.branchName}</p>
                                    <p className={`text-[10px] font-bold ${getStatusColor(s.status)}`}>{s.message}</p>
                                </div>
                                {s.status === 'pulling' && (
                                    <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">جاري السحب</span>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="p-2 border-t border-slate-100 bg-slate-50">
                        <button
                            onClick={() => setShowStatus(false)}
                            className="w-full text-[10px] font-bold text-slate-400 hover:text-slate-600 py-1"
                        >
                            إخفاء
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
