'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { storage } from "@/lib/storage";

interface UserProfile {
  id: string;
  approved: boolean;
  role: string;
  name?: string;
  email?: string;
  avatar_url?: string;
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function StableAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    error: null
  });

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Cache para perfil do usuário
  const getCachedProfile = useCallback((userId: string): UserProfile | null => {
    try {
      const cached = storage.getItem(`user_profile_${userId}`);
      if (cached) {
        const { profile, timestamp } = JSON.parse(cached);
        // Cache válido por 10 minutos
        if (Date.now() - timestamp < 10 * 60 * 1000) {
          return profile;
        }
      }
    } catch (error) {
      console.warn('Error reading profile cache:', error);
    }
    return null;
  }, []);

  const setCachedProfile = useCallback((userId: string, profile: UserProfile) => {
    try {
      storage.setItem(`user_profile_${userId}`, JSON.stringify({
        profile,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Error setting profile cache:', error);
    }
  }, []);

  // Buscar perfil do usuário com retry
  const fetchUserProfile = useCallback(async (userId: string, attempt = 0): Promise<UserProfile | null> => {
    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('id, approved, role, name, email, avatar_url')
        .eq('id', userId)
        .single();

      if (error) {
        throw error;
      }

      if (profile) {
        setCachedProfile(userId, profile);
        return profile;
      }

      return null;
    } catch (error) {
      console.error(`Profile fetch attempt ${attempt + 1} failed:`, error);
      
      // Retry até 2 vezes
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        return fetchUserProfile(userId, attempt + 1);
      }
      
      // Usar cache como fallback
      return getCachedProfile(userId);
    }
  }, [supabase, getCachedProfile, setCachedProfile]);

  // Atualizar estado de autenticação
  const updateAuthState = useCallback(async (user: User | null) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      if (user) {
        // Tentar cache primeiro
        let profile = getCachedProfile(user.id);
        
        if (!profile) {
          // Buscar do servidor
          profile = await fetchUserProfile(user.id);
        }

        setState({
          user,
          profile,
          loading: false,
          error: profile ? null : 'Não foi possível carregar o perfil do usuário'
        });
      } else {
        // Limpar cache ao fazer logout
        const keys = storage.keys();
        keys.forEach(key => {
          if (key.startsWith('user_profile_') || key.startsWith('stable_cache_')) {
            storage.removeItem(key);
          }
        });

        setState({
          user: null,
          profile: null,
          loading: false,
          error: null
        });
      }
    } catch (error) {
      console.error('Error updating auth state:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Erro ao carregar dados de autenticação'
      }));
    }
  }, [getCachedProfile, fetchUserProfile]);

  // Sign out
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      // O listener vai atualizar o estado automaticamente
    } catch (error) {
      console.error('Error signing out:', error);
      setState(prev => ({
        ...prev,
        error: 'Erro ao fazer logout'
      }));
    }
  }, [supabase]);

  // Refresh session
  const refreshSession = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      
      if (session?.user) {
        await updateAuthState(session.user);
      }
    } catch (error) {
      console.error('Error refreshing session:', error);
      setState(prev => ({
        ...prev,
        error: 'Erro ao atualizar sessão'
      }));
    }
  }, [supabase, updateAuthState]);

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Setup auth listener
  useEffect(() => {
    let mounted = true;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        updateAuthState(session?.user || null);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (mounted) {
          console.log('Auth state changed:', event);
          await updateAuthState(session?.user || null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, updateAuthState]);

  return (
    <AuthContext.Provider value={{
      ...state,
      signOut,
      refreshSession,
      clearError
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useStableAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useStableAuth must be used within a StableAuthProvider');
  }
  return context;
}
