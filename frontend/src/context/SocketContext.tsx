import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false
});

export const useSocket = () => useContext(SocketContext);

interface SocketProviderProps {
    children: ReactNode;
}

export const SocketProvider = ({ children }: SocketProviderProps) => {
    const { user, token } = useAuth();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const queryClient = useQueryClient();
    const invalidatedRef = useRef<number>(0);

    useEffect(() => {
        // Only connect if user is authenticated and we have a token
        if (!user || !token) {
            if (socket) {
                socket.disconnect();
                setSocket(null);
                setIsConnected(false);
            }
            return;
        }

        // Create socket connection with authentication
        const newSocket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity,
            timeout: 20000
        });

        newSocket.on('connect', () => {
            setIsConnected(true);
        });

        // --- Global Real-time Listeners ---
        newSocket.on('request-created', (data: any) => {
            toast.success(
                <div className="flex flex-col gap-1">
                    <span className="font-bold">طلب صيانة جديد! 🛠️</span>
                    <span className="text-xs opacity-80">{data.customerName} - {data.serialNumber}</span>
                </div>,
                { duration: 5000, icon: '🔧' }
            );
        });

        newSocket.on('request-closed', (data: any) => {
            toast.success(
                <div className="flex flex-col gap-1">
                    <span className="font-bold">تم إغلاق طلب! ✅</span>
                    <span className="text-xs opacity-80">{data.customerName} - {data.totalCost} ج.م</span>
                </div>,
                { duration: 5000, icon: '🎉' }
            );
        });

        newSocket.on('stock-alert', (data: any) => {
            toast.error(
                <div className="flex flex-col gap-1">
                    <span className="font-bold">تنبيه مخزون! 📦</span>
                    <span className="text-xs opacity-80">{data.message}</span>
                </div>,
                { duration: 8000, icon: '⚠️' }
            );
        });

        newSocket.on('admin-alert', (data: any) => {
            if (user?.role === 'SUPER_ADMIN') {
                toast(data.message, {
                    icon: '🚀',
                    style: { background: '#1e293b', color: '#fff', fontSize: '12px' }
                });
            }
        });

        newSocket.on('data_updated', (data: any) => {
            const now = Date.now();
            if (now - invalidatedRef.current < 2000) return;
            invalidatedRef.current = now;

            const { entities = [] } = data;
            const e = new Set(entities.map(String));

            const always = () => {
                queryClient.invalidateQueries({ queryKey: ['branches-list'] });
                queryClient.invalidateQueries({ queryKey: ['active-branches'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard-branches'] });
                queryClient.invalidateQueries({ queryKey: ['branch-summaries'] });
                queryClient.invalidateQueries({ queryKey: ['sync-status'] });
                queryClient.invalidateQueries({ queryKey: ['branch-status'] });
                queryClient.invalidateQueries({ queryKey: ['notification-count'] });
                queryClient.invalidateQueries({ queryKey: ['notifications'] });
            };

            if (e.has('machineSales') || e.has('installments') || e.has('payments')) {
                queryClient.invalidateQueries({ queryKey: ['monthly-closing'] });
                queryClient.invalidateQueries({ queryKey: ['monthly-closing-versions'] });
                queryClient.invalidateQueries({ queryKey: ['monthly-closing-branches-status'] });
                queryClient.invalidateQueries({ queryKey: ['sales'] });
                queryClient.invalidateQueries({ queryKey: ['overdue-installments'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard-spare-parts'] });
            }

            if (e.has('customers')) {
                queryClient.invalidateQueries({ queryKey: ['monthly-closing'] });
                queryClient.invalidateQueries({ queryKey: ['client-types'] });
            }

            if (e.has('maintenanceRequests') || e.has('usedPartLogs')) {
                queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] });
                queryClient.invalidateQueries({ queryKey: ['monthly-closing'] });
            }

            if (e.has('payments')) {
                queryClient.invalidateQueries({ queryKey: ['payments'] });
            }

            if (e.has('stockMovements') || e.has('inventory') || e.has('usedPartLogs')) {
                queryClient.invalidateQueries({ queryKey: ['inventory-all'] });
                queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
                queryClient.invalidateQueries({ queryKey: ['spare-parts-report'] });
                queryClient.invalidateQueries({ queryKey: ['spare-parts-additions'] });
                queryClient.invalidateQueries({ queryKey: ['spare-parts'] });
                queryClient.invalidateQueries({ queryKey: ['price-history'] });
                queryClient.invalidateQueries({ queryKey: ['price-logs'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard-spare-parts'] });
            }

            if (e.has('simCards') || e.has('simMovements')) {
                queryClient.invalidateQueries({ queryKey: ['simcards'] });
                queryClient.invalidateQueries({ queryKey: ['sim-movements'] });
            }

            if (e.has('posMachines')) {
                queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] });
            }

            if (e.has('warehouseMachines') || e.has('warehouseSims')) {
                queryClient.invalidateQueries({ queryKey: ['inventory-all'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard-spare-parts'] });
            }

            always();
        });

        newSocket.on('disconnect', () => {
            setIsConnected(false);
        });

        newSocket.on('connect_error', (error) => {
            console.error('Socket connection error:', error.message);
        });

        setSocket(newSocket);

        // Cleanup on unmount
        return () => {
            newSocket.disconnect();
        };
    }, [user, token]);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};
