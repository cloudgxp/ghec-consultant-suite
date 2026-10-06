import { parseArgs } from 'node:util';
import {
  createConsoleServer,
  type ConsoleServerOptions,
} from '../server/server.js';

export interface ConsoleCommandOptions {
  port?: number | undefined;
  host?: string | undefined;
  openBrowser?: boolean | undefined;
}

export function parseConsoleOptions(args: string[]): ConsoleCommandOptions {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      port: { type: 'string' },
      host: { type: 'string', default: '127.0.0.1' },
      'no-open': { type: 'boolean', default: false },
    },
  });

  let port: number | undefined;
  if (values.port) {
    const parsed = Number.parseInt(values.port, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error(
        `Invalid port: "${values.port}". Port must be an integer between 1 and 65535.`,
      );
    }
    port = parsed;
  }

  return {
    port,
    host: values.host,
    openBrowser: !values['no-open'],
  };
}

export async function executeConsoleCommand(
  options: ConsoleCommandOptions,
  serverOverrides?: ConsoleServerOptions,
  signal?: AbortSignal,
): Promise<{ address: string; port: number; stop: () => Promise<void> }> {
  const mergedOptions: ConsoleServerOptions = {
    port: options.port ?? serverOverrides?.port ?? 3000,
    host: options.host ?? serverOverrides?.host ?? '127.0.0.1',
    openBrowser: options.openBrowser ?? serverOverrides?.openBrowser ?? true,
    distPath: serverOverrides?.distPath,
    explicitToken: serverOverrides?.explicitToken,
    fetchFn: serverOverrides?.fetchFn,
  };

  const server = await createConsoleServer(mergedOptions);
  const result = await server.start();

  console.log(
    `GHEC Migration Operations Console running at: ${result.address}`,
  );
  console.log('Press Ctrl+C to stop the console server.');

  if (signal) {
    signal.addEventListener(
      'abort',
      async () => {
        await server.stop();
      },
      { once: true },
    );
  }

  return {
    address: result.address,
    port: result.port,
    stop: server.stop,
  };
}
