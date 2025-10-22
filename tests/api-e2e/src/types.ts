export type RunEnvironment = 'local' | 'staging';

export interface ScenarioContext {
  env: RunEnvironment;
  dryRun: boolean;
  fixtures: {
    cardImagePath: string;
  };
  log: (message: string) => void;
  api: ApiClient;
  state: ScenarioState;
}

export interface SharedSeedTracking {
  enabled: boolean;
  seedStatePath: string;
  persisted?: boolean;
}

export type ScenarioStatus = 'passed' | 'failed' | 'skipped';

export interface ScenarioOutcome {
  status: ScenarioStatus;
  notes?: string;
  error?: Error;
}

export interface ScenarioDefinition {
  id: string;
  description: string;
  execute: (context: ScenarioContext) => Promise<ScenarioOutcome>;
}

export interface AuthSession {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: string;
}

export interface ApiClient {
  registerUser(input: { email: string; password: string; name: string }): Promise<AuthSession>;
  login(input: { email: string; password: string }): Promise<AuthSession>;
  getProfile(accessToken: string): Promise<{ email: string }>;
  createUpload(
    accessToken: string,
    input: { fileName: string; checksum: string; contentType: string; size: number }
  ): Promise<UploadRecord>;
  completeUpload(accessToken: string, uploadId: string): Promise<UploadRecord>;
  scanCard(
    accessToken: string,
    input: { fileName: string; imageUrl: string; tags?: string[] }
  ): Promise<{ card: CardRecord; ocrJobId: string; enrichmentId: string }>;
  updateCard(
    accessToken: string,
    cardId: string,
    input: Partial<{
      name: string;
      title: string;
      company: string;
      email: string;
      phone: string;
      address: string;
      website: string;
      notes: string;
      tags: string[];
    }>
  ): Promise<CardRecord>;
  listCards(accessToken: string): Promise<CardRecord[]>;
  searchCards(
    accessToken: string,
    input: { query: string; tags?: string[] }
  ): Promise<CardRecord[]>;
}

export interface ScenarioState {
  runId: string;
  user?: {
    email: string;
    password: string;
    userId: string;
    accessToken: string;
    refreshToken: string;
  };
  upload?: UploadSnapshot;
  card?: CardSnapshot;
  ocrJobId?: string;
  searchQuery?: string;
  sharedSeed?: SharedSeedTracking;
}

export interface UploadRecord {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  status: string;
  presignedUrl: string;
  cdnUrl: string;
  checksum: string;
}

export interface CardRecord {
  id: string;
  name?: string | null;
  title?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UploadSnapshot {
  id: string;
  fileName: string;
  cdnUrl: string;
  presignedUrl: string;
  checksum: string;
  size: number;
  tag: string;
}

export interface CardSnapshot {
  id: string;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  tags?: string[];
}
