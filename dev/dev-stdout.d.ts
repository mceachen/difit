export interface CliStdoutProxy {
  push(chunk: string): void;
  flush(): void;
}

export interface CreateCliStdoutProxyOptions {
  showServerUrl?: boolean;
  onServerUrl: (serverUrl: string) => void;
  onOutput: (output: string) => void;
}

export function createCliStdoutProxy(options: CreateCliStdoutProxyOptions): CliStdoutProxy;
