export type RunEnvironment = 'local' | 'staging';

export interface ScenarioContext {
  env: RunEnvironment;
  dryRun: boolean;
  fixtures: {
    cardImagePath: string;
  };
  log: (message: string) => void;
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
