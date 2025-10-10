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
  upload?: {
    id: string;
  };
  card?: {
    id: string;
  };
}
