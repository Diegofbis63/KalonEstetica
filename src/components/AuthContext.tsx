import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
    id: string;
    email: string;
    username: string;
    role: 'admin' | 'staff' | 'guest';
    permissions?: string[];
}

interface AuthContextType {
    isAuthenticated: boolean | null; // null means "checking"
    user: User | null;
    login: (userData: User) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Initial sync check to avoid white screens
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(() => {
        const auth = localStorage.getItem("kalon_auth");
        if (auth) {
            try {
                const parsed = JSON.parse(auth);
                if (Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
                    return true;
                }
            } catch (e) {
                // Ignore parsing errors on initial render
            }
        }
        return null; // Let the effect double-check
    });

    const [user, setUser] = useState<User | null>(() => {
        const auth = localStorage.getItem("kalon_auth");
        if (auth) {
            try {
                const parsed = JSON.parse(auth);
                if (Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
                    return parsed.user;
                }
            } catch (e) {
                // Return null
            }
        }
        return null;
    });

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await fetch('/api/auth');
                if (res.ok) {
                    const data = await res.json();
                    setIsAuthenticated(true);
                    setUser(data.user);
                    // Sync back to local storage
                    localStorage.setItem("kalon_auth", JSON.stringify({
                        authenticated: true,
                        user: data.user,
                        timestamp: Date.now()
                    }));
                } else {
                    // Cookie has expired or is invalid
                    localStorage.removeItem("kalon_auth");
                    setIsAuthenticated(false);
                    setUser(null);
                }
            } catch (e) {
                // Network error: Fall back to local storage if available
                const auth = localStorage.getItem("kalon_auth");
                if (auth) {
                    try {
                        const parsed = JSON.parse(auth);
                        if (Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
                            setIsAuthenticated(true);
                            setUser(parsed.user);
                            return;
                        }
                    } catch (e2) {
                        // ignore
                    }
                }
                setIsAuthenticated(false);
                setUser(null);
            }
        };

        checkAuth();
    }, []);

    // Auth state debug log removed for production quality

    const login = (userData: User) => {
        localStorage.setItem("kalon_auth", JSON.stringify({
            authenticated: true,
            user: userData,
            timestamp: Date.now()
        }));
        setIsAuthenticated(true);
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem("kalon_auth");
        setIsAuthenticated(false);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
