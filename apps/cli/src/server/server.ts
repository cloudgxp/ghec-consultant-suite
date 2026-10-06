import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { getAuthStatus, resolveAmbientToken } from './auth-bridge.js';
import { registerActionsProxy } from './actions-proxy.js';
import { registerPreflightProxy } from './preflight-proxy.js';
import { SseManager } from './sse.js';

export interface ConsoleServerOptions {
  port?: number | undefined;
  host?: string | undefined;
  openBrowser?: boolean | undefined;
  distPath?: string | undefined;
  explicitToken?: string | undefined;
  fetchFn?: typeof fetch | undefined;
}

export function openUrlInBrowser(url: string): void {
  try {
    if (process.platform === 'darwin') {
      execFile('open', [url], () => {});
    } else if (process.platform === 'win32') {
      execFile('cmd', ['/c', 'start', '', url], () => {});
    } else {
      execFile('xdg-open', [url], () => {});
    }
  } catch {
    // Non-fatal in headless/remote environments
  }
}

function resolveDistPath(customPath?: string): string | null {
  if (customPath && existsSync(customPath)) {
    return customPath;
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    resolve(process.cwd(), 'apps/dashboard/dist'),
    resolve(currentDir, '../../../dashboard/dist'),
    resolve(currentDir, '../../dashboard/dist'),
  ];

  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function createConsoleServer(
  options: ConsoleServerOptions = {},
): Promise<{
  app: FastifyInstance;
  sseManager: SseManager;
  start: () => Promise<{ address: string; port: number }>;
  stop: () => Promise<void>;
}> {
  const app = Fastify({
    logger: false,
  });

  const sseManager = new SseManager();
  const fetchFn = options.fetchFn ?? fetch;

  let cachedToken: string | null = options.explicitToken ?? null;
  const getToken = async (): Promise<string | null> => {
    if (cachedToken) return cachedToken;
    const resolved = await resolveAmbientToken();
    cachedToken = resolved.token;
    return cachedToken;
  };

  // Auth status endpoint
  app.get('/api/auth/status', async () => {
    const token = await getToken();
    const status = await getAuthStatus(token, fetchFn);
    return {
      authenticated: status.authenticated,
      authType: status.authType,
      user: status.user,
    };
  });

  // Server-Sent Events endpoint
  app.get('/api/events', (req, reply) => {
    sseManager.handleConnection(req, reply);
  });

  // Register Actions API proxy routes
  registerActionsProxy(app, {
    getToken,
    sseManager,
    fetchFn,
  });

  // Register local preflight proxy
  registerPreflightProxy(app, {
    getToken,
  });

  // Serve static assets if dashboard dist exists
  const distDir = resolveDistPath(options.distPath);
  if (distDir) {
    await app.register(fastifyStatic, {
      root: distDir,
      prefix: '/',
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'Endpoint not found' });
    });
  } else {
    app.get('/', async (_req, reply) => {
      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html>
          <head><title>GHEC Console Server</title></head>
          <body style="font-family: sans-serif; padding: 2rem;">
            <h2>GHEC Operations Console Server is Running</h2>
            <p>Dashboard build artifacts not found at apps/dashboard/dist. Run <code>npm run build -w @ghec/dashboard</code> to generate them.</p>
          </body>
        </html>
      `);
    });
  }

  const start = async (): Promise<{ address: string; port: number }> => {
    const preferredPort = options.port ?? 3000;
    const host = options.host ?? '127.0.0.1';
    let currentPort = preferredPort;
    const maxRetries = 10;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const address = await app.listen({
          port: currentPort,
          host,
        });

        if (options.openBrowser !== false) {
          openUrlInBrowser(`http://${host}:${currentPort}`);
        }

        return { address, port: currentPort };
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        if (code === 'EADDRINUSE' && attempt < maxRetries) {
          currentPort++;
          continue;
        }
        throw err;
      }
    }

    throw new Error(`Failed to bind to host ${host} after multiple attempts.`);
  };

  const stop = async (): Promise<void> => {
    sseManager.close();
    await app.close();
  };

  return { app, sseManager, start, stop };
}
