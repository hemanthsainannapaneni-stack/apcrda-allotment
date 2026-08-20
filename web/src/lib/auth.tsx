import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, onSessionLost, post, tokens } from './api';

export type User = {
  id: string;
  name: string;
  email: string;
  roleKey: string;
  roleName: string;
  capabilities: string[];
  wing?: string | null;
  committee?: string | null;
  designation?: string | null;
  lastLoginAt?: string | null;
  applicantProfiles?: { id: string; name: string }[];
};

export type StageField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'currency' | 'percent' | 'date' | 'select' | 'boolean';
  required?: boolean;
  options?: string[];
  optionSource?: 'modes' | 'holdingTypes' | 'landUses' | 'objectives';
  help?: string;
};

export type Stage = {
  id: string;
  code: string;
  name: string;
  order: number;
  phase: string;
  type: string;
  ownerRoleKey: string;
  coOwnerRole: string | null;
  slaDays: number;
  maxRounds: number;
  roundLabels: string[];
  outcomes: { value: string; label: string; kind: string; to?: string; tone?: string }[];
  fields: StageField[];
  docTypes: string[];
  routing: Record<string, any>;
  optional: boolean;
  enabled: boolean;
  description: string;
};

export type Meta = {
  modes: { value: string; label: string }[];
  objectiveCategories: { value: string; label: string }[];
  entityTypes: { value: string; label: string }[];
  holdingTypes: { value: string; label: string }[];
  sectors: string[];
  themeCities: string[];
  landUses: string[];
  documentTypes: string[];
  nocTypes: string[];
  paymentTypes: { value: string; label: string }[];
  grievanceCategories: string[];
  phases: { value: string; label: string }[];
  caseStatuses: string[];
  currency: string;
  organisation: { name: string; shortName: string; portalName: string; fiscalYearStart: string };
  roles: { key: string; name: string; description: string; capabilities: string[] }[];
  stages: Stage[];
  workflow: {
    loiValidityDays: number;
    cabinetTestExtentAcres: number;
    commencementDeadlineYears: number;
    penaltyRatePctPerAnnum: number;
  };
};

type AuthValue = {
  user: User | null;
  meta: Meta | null;
  loading: boolean;
  signIn: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  can: (...capabilities: string[]) => boolean;
  isRole: (...roles: string[]) => boolean;
  refreshUser: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  const load = useCallback(async () => {
    if (!tokens.access) {
      setUser(null);
      setBooting(false);
      return;
    }
    try {
      setUser(await get<User>('/auth/me'));
    } catch {
      tokens.clear();
      setUser(null);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const handler = () => setUser(null);
    onSessionLost.add(handler);
    return () => {
      onSessionLost.delete(handler);
    };
  }, [load]);

  const { data: meta } = useQuery({
    queryKey: ['meta'],
    queryFn: () => get<Meta>('/meta'),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const signIn = useCallback(async (email: string, password: string, rememberMe: boolean) => {
    const data = await post('/auth/login', { email, password, rememberMe });
    tokens.set(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await post('/auth/logout', { refreshToken: tokens.refresh });
    } catch {
      /* clearing the local session is enough */
    }
    tokens.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      meta: meta ?? null,
      loading: booting,
      signIn,
      signOut,
      can: (...caps: string[]) =>
        !!user && (user.roleKey === 'SUPER_ADMIN' || caps.some((c) => user.capabilities.includes(c))),
      isRole: (...roles: string[]) => !!user && roles.includes(user.roleKey),
      refreshUser: () => void load(),
    }),
    [user, meta, booting, signIn, signOut, load]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The stage catalogue, keyed for lookup. */
export function useStages() {
  const { meta } = useAuth();
  return useMemo(() => {
    const list = meta?.stages ?? [];
    return { list, byId: Object.fromEntries(list.map((s) => [s.id, s])) as Record<string, Stage> };
  }, [meta]);
}
