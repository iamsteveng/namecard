const resolveBaseUrl = (): string => {
  const runtimeEnv = (globalThis as any)?.__ENV__?.VITE_API_URL;
  const viteEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_API_URL : undefined;
  const fallback = typeof window !== 'undefined' ? window.location.origin : '';

  const raw = runtimeEnv ?? viteEnv ?? fallback ?? '';
  return raw.replace(/\/+$/, '');
};

export const API_BASE_URL = resolveBaseUrl();
export const API_V1_PREFIX = '/v1';

const joinPaths = (base: string, path: string): string => {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

export const buildApiUrl = (path: string): string => joinPaths(API_BASE_URL, path);

export const buildV1Url = (path: string): string => {
  const trimmed = path?.trim?.() ?? '';
  if (!trimmed) {
    return `${API_BASE_URL}${API_V1_PREFIX}`;
  }

  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${API_BASE_URL}${API_V1_PREFIX}${normalizedPath}`;
};
