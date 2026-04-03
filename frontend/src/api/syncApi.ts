import { request } from './baseClient';

export interface BranchSyncStatus {
    id: string;
    code: string;
    name: string;
    status: string;
    lastSeen: string | null;
    url: string | null;
    entitySync: Record<string, {
        lastSyncedAt: string;
        recordCount: number;
        status: string;
        errorMessage: string | null;
    }>;
}

export interface SyncLogEntry {
    id: string;
    branchId: string | null;
    branchCode: string | null;
    branchName: string | null;
    type: string;
    status: string;
    message: string;
    itemCount: number;
    details: string | null;
    createdAt: string;
    branch?: { id: string; code: string; name: string };
}

export interface SyncQueueEntry {
    id: string;
    branchId: string;
    entityType: string;
    action: string;
    payload: any;
    status: string;
    error: string | null;
    createdAt: string;
    branch?: { id: string; code: string; name: string };
}

export interface CleanupPolicy {
    entityType: string;
    retentionDays: number;
    enabled: boolean;
    description: string;
}

export interface CleanupResult {
    totalDeleted: number;
    duration: number;
    results: Record<string, { status: string; deleted?: number; retentionDays?: number; error?: string }>;
    completedAt: string;
}

const syncApi = {
    getSyncStatus: (): Promise<{ success: boolean; branches: BranchSyncStatus[]; total: number }> => {
        return request('/sync/status');
    },

    getBranchSyncStatus: (branchId: string): Promise<{ success: boolean; branch: any; entitySync: Record<string, any>; recentLogs: SyncLogEntry[] }> => {
        return request(`/sync/status/${branchId}`);
    },

    getSyncLogs: (params?: { limit?: number; offset?: number; type?: string; branchId?: string; status?: string; startDate?: string; endDate?: string }): Promise<{ data: SyncLogEntry[]; pagination: { total: number; limit: number; offset: number; pages: number } }> => {
        const query = new URLSearchParams();
        if (params?.limit) query.set('limit', String(params.limit));
        if (params?.offset) query.set('offset', String(params.offset));
        if (params?.type) query.set('type', params.type);
        if (params?.branchId) query.set('branchId', params.branchId);
        if (params?.status) query.set('status', params.status);
        if (params?.startDate) query.set('startDate', params.startDate);
        if (params?.endDate) query.set('endDate', params.endDate);
        return request(`/sync/logs?${query.toString()}`);
    },

    getSyncQueue: (params?: { status?: string; branchId?: string }): Promise<{ success: boolean; queue: SyncQueueEntry[]; total: number }> => {
        const query = new URLSearchParams();
        if (params?.status) query.set('status', params.status);
        if (params?.branchId) query.set('branchId', params.branchId);
        return request(`/sync/queue?${query.toString()}`);
    },

    requestFullSync: (branchId: string): Promise<{ message: string }> => {
        return request(`/sync/request-full-sync/${branchId}`, { method: 'POST' });
    },

    requestReportSync: (branchId: string): Promise<{ message: string }> => {
        return request(`/sync/request-report-sync/${branchId}`, { method: 'POST' });
    },

    getCleanupPolicy: (): Promise<{ success: boolean; policy: CleanupPolicy[] }> => {
        return request('/sync/cleanup-policy');
    },

    updateCleanupPolicy: (entityType: string, data: { retentionDays?: number; enabled?: boolean }): Promise<{ success: boolean; message: string }> => {
        return request(`/sync/cleanup-policy/${entityType}`, { method: 'PUT', body: JSON.stringify(data) });
    },

    runCleanup: (): Promise<CleanupResult> => {
        return request('/sync/cleanup/run', { method: 'POST' });
    }
};

export default syncApi;
