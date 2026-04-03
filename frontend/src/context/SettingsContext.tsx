import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import adminClient from '../api/adminClient';

interface UserPreferences {
  fontSize: 'small' | 'medium' | 'large';
  highlightEffect: boolean;
  notificationSound: boolean;
  mobilePush: boolean;
  theme: string;
  fontFamily: string;
}

interface SettingsContextType {
  preferences: UserPreferences | null;
  updatePreferences: (updates: Partial<UserPreferences>) => Promise<void>;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
};

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  const defaultPrefs: UserPreferences = {
    fontSize: 'medium',
    highlightEffect: true,
    notificationSound: true,
    mobilePush: false,
    theme: 'light',
    fontFamily: 'IBM Plex Sans Arabic',
  };

  useEffect(() => {
    if (user) {
      fetchPreferences();
    } else {
      setPreferences(defaultPrefs);
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (preferences?.fontSize) {
      document.documentElement.setAttribute('data-font-size', preferences.fontSize);
    }
  }, [preferences?.fontSize]);

  useEffect(() => {
    if (preferences?.fontFamily) {
      document.documentElement.style.setProperty('--font-arabic', preferences.fontFamily);
      localStorage.setItem('arabic-font', preferences.fontFamily);
    }
  }, [preferences?.fontFamily]);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const { data } = await adminClient.get('/auth/preferences');
      setPreferences(data.preferences || data);
    } catch (error) {
      console.error('Failed to fetch preferences:', error);
      setPreferences(defaultPrefs);
    } finally {
      setLoading(false);
    }
  };

  const updatePreferences = async (updates: Partial<UserPreferences>) => {
    try {
      const { data } = await adminClient.put('/auth/preferences', updates);
      setPreferences(data.preferences || data);
    } catch (error) {
      console.error('Failed to update preferences:', error);
      throw error;
    }
  };

  return (
    <SettingsContext.Provider value={{ preferences, updatePreferences, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch preferences when user logs in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (user && token) {
      fetchPreferences();
    } else {
      // Set defaults when no user or token
      setPreferences({
        fontSize: 'medium',
        highlightEffect: true,
        notificationSound: true,
        mobilePush: false,
        theme: 'light',
        fontFamily: 'IBM Plex Sans Arabic',
      });
      setLoading(false);
    }
  }, [user]);

  // Apply font size to document root
  useEffect(() => {
    if (preferences?.fontSize) {
      document.documentElement.setAttribute('data-font-size', preferences.fontSize);
    }
  }, [preferences?.fontSize]);

  // Apply font family to CSS variable
  useEffect(() => {
    if (preferences?.fontFamily) {
      document.documentElement.style.setProperty('--font-arabic', preferences.fontFamily);
      // Also store in localStorage for immediate load on next visit to prevent FOUC (Flash of Unstyled Content)
      localStorage.setItem('arabic-font', preferences.fontFamily);
    }
  }, [preferences?.fontFamily]);

  const fetchPreferences = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      // No token, set defaults without API call
      setPreferences({
        fontSize: 'medium',
        highlightEffect: true,
        notificationSound: true,
        mobilePush: false,
        theme: 'light',
        fontFamily: 'IBM Plex Sans Arabic',
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await api.get<any>('/auth/preferences');
      setPreferences(data.preferences || data);
    } catch (error) {
      console.error('Failed to fetch preferences:', error);
      // Set defaults if fetch fails
      setPreferences({
        fontSize: 'small',
        highlightEffect: true,
        notificationSound: true,
        mobilePush: false,
        theme: 'light',
        fontFamily: 'IBM Plex Sans Arabic',
      });
    } finally {
      setLoading(false);
    }
  };

  const updatePreferences = async (updates: Partial<UserPreferences>) => {
    try {
      const data = await api.put<any>('/auth/preferences', updates);
      setPreferences(data.preferences || data);
    } catch (error) {
      console.error('Failed to update preferences:', error);
      throw error;
    }
  };

  return (
    <SettingsContext.Provider value={{ preferences, updatePreferences, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};
