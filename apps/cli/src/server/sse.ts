import type { FastifyReply, FastifyRequest } from 'fastify';

export interface SseClient {
  id: string;
  reply: FastifyReply;
}

export class SseManager {
  private clients: Map<string, SseClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private activePollers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.heartbeatInterval = setInterval(() => {
      this.sendRaw(': keepalive\n\n');
    }, 15000);
  }

  public handleConnection(req: FastifyRequest, reply: FastifyReply): void {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    const client: SseClient = { id, reply };
    this.clients.set(id, client);

    this.sendToClient(client, 'connected', { clientId: id });

    req.raw.on('close', () => {
      this.clients.delete(id);
    });
  }

  public broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.sendRaw(payload);
  }

  private sendToClient(client: SseClient, event: string, data: unknown): void {
    try {
      client.reply.raw.write(
        `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
      );
    } catch {
      this.clients.delete(client.id);
    }
  }

  private sendRaw(text: string): void {
    for (const [id, client] of this.clients.entries()) {
      try {
        client.reply.raw.write(text);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  public trackRun(
    owner: string,
    repo: string,
    runId: number,
    token: string,
    fetchFn: typeof fetch = fetch,
  ): void {
    const key = `${owner}/${repo}/${runId}`;
    if (this.activePollers.has(key)) {
      return;
    }

    let previousStatus = '';
    let intervalMs = 3000;

    const poll = async () => {
      try {
        const res = await fetchFn(
          `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'ghec-consultant-cli',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          },
        );

        if (res.ok) {
          const run = (await res.json()) as {
            status: string;
            conclusion: string | null;
          };
          this.broadcast('run_update', { runId, run });

          if (run.status === 'completed') {
            const timer = this.activePollers.get(key);
            if (timer) {
              clearInterval(timer);
              this.activePollers.delete(key);
            }
            return;
          }

          if (run.status === previousStatus) {
            intervalMs = Math.min(intervalMs + 1000, 10000);
          } else {
            previousStatus = run.status;
            intervalMs = 3000;
          }
        }
      } catch {
        // Polling error backoff
        intervalMs = Math.min(intervalMs * 1.5, 15000);
      }
    };

    const timer = setInterval(poll, intervalMs);
    this.activePollers.set(key, timer);
    void poll();
  }

  public close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const timer of this.activePollers.values()) {
      clearInterval(timer);
    }
    this.activePollers.clear();
    for (const client of this.clients.values()) {
      try {
        client.reply.raw.end();
      } catch {
        // Ignored on close
      }
    }
    this.clients.clear();
  }
}
