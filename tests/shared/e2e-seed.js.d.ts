export interface SharedSeedUser {
  userId: string;
  email: string;
  password: string;
}

export interface SharedSeedCard {
  id: string;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  tags?: string[];
  searchQuery?: string | null;
}

export interface SharedSeedUpload {
  id: string;
  tag?: string | null;
  fileName?: string | null;
  checksum?: string | null;
  cdnUrl?: string | null;
}

export interface SharedSeedState {
  version?: number;
  source?: string;
  env?: string;
  runId?: string;
  generatedAt?: string;
  user: SharedSeedUser;
  card?: SharedSeedCard;
  upload?: SharedSeedUpload;
  notes?: string;
}

export const repoRoot: string;
export const fixturesDir: string;
export const cardFixturePath: string;
export const seedStatePath: string;
export const DEFAULT_SEED_USER_ID: string;
export const DEFAULT_SEED_USER_EMAIL: string;
export const DEFAULT_SEED_USER_PASSWORD: string;

export function ensureCardFixture(): Promise<{ path: string; size: number }>;
export function readSharedSeedState(): Promise<SharedSeedState | null>;
export function writeSharedSeedState(state: SharedSeedState): Promise<void>;
export function removeSharedSeedState(): Promise<void>;
export function describeSeedSummary(state: SharedSeedState | null | undefined): string;
