import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import adminClient from '../api/adminClient';

interface User {
    id: string;
    email: string;
    displayName: string;
    role: string;
    branchId: string | null;
    branchType?: string;
    authorizedBranchIds?: string[];
    theme?: string;
    themeVariant?: 'glass' | 'solid';
    fontFamily?: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    activeBranchId: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    setActiveBranchId: (branchId: string | null) => void;
    isAuthenticated: boolean;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [activeBranchId, setActiveBranchIdState] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const setActiveBranchId = (branchId: string | null) => {
        setActiveBranchIdState(branchId);
        if (branchId) {
            localStorage.setItem('activeBranchId', branchId);
        } else {
            localStorage.removeItem('activeBranchId');
        }
    };

    useEffect(() => {
        const storedToken = localStorage.getItem('portal_token');
        const storedUser = localStorage.getItem('portal_user');
        const storedActiveBranch = localStorage.getItem('activeBranchId');

        if (storedToken && storedUser) {
            adminClient.defaults.headers.common.Authorization = `Bearer ${storedToken}`;
            adminClient.get('/branches')
                .then(() => {
                    setToken(storedToken);
                    try {
                        setUser(JSON.parse(storedUser));
                    } catch {
                        localStorage.removeItem('portal_user');
                    }
                    if (storedActiveBranch) {
                        setActiveBranchIdState(storedActiveBranch);
                    }
                })
                .catch(() => {
                    localStorage.removeItem('portal_token');
                    localStorage.removeItem('portal_user');
                    delete adminClient.defaults.headers.common.Authorization;
                })
                .finally(() => {
                    setIsLoading(false);
                });
        } else {
            setIsLoading(false);
        }
    }, []);

    const login = (newToken: string, newUser: User) => {
        setToken(newToken);
        setUser(newUser);
        setActiveBranchIdState(newUser.branchId);
        localStorage.setItem('portal_token', newToken);
        localStorage.setItem('portal_user', JSON.stringify(newUser));
        if (newUser.branchId) {
            localStorage.setItem('activeBranchId', newUser.branchId);
        }
        adminClient.defaults.headers.common.Authorization = `Bearer ${newToken}`;
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        setActiveBranchIdState(null);
        localStorage.removeItem('portal_token');
        localStorage.removeItem('portal_user');
        localStorage.removeItem('activeBranchId');
        delete adminClient.defaults.headers.common.Authorization;
    };

    return (
        <AuthContext.Provider value={{ user, token, activeBranchId, setActiveBranchId, login, logout, isAuthenticated: !!token, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
