export interface WebhookDefinition {
  readonly id?: number | undefined;
  readonly url: string;
  readonly events: readonly string[];
  readonly active: boolean;
  readonly contentType: 'json' | 'form';
  readonly insecureSsl: boolean;
  readonly secretConfigured: boolean;
}

export interface WebhooksData {
  readonly level: 'organization' | 'repository';
  readonly hooks: readonly WebhookDefinition[];
}

export interface WebhookSecretProvider {
  getSecret(input: {
    readonly url: string;
    readonly sourceOrg: string;
    readonly sourceRepo?: string | undefined;
    readonly targetOrg: string;
    readonly targetRepo?: string | undefined;
    readonly signal: AbortSignal;
  }): Promise<string | undefined>;
}

export interface WebhooksModuleOptions {
  readonly secretProvider?: WebhookSecretProvider | undefined;
}

export interface RawWebhook {
  readonly id?: number | undefined;
  readonly active?: boolean | undefined;
  readonly events?: readonly string[] | undefined;
  readonly config?:
    | {
        readonly url?: string | undefined;
        readonly content_type?: 'json' | 'form' | undefined;
        readonly insecure_ssl?: string | number | undefined;
        readonly secret?: string | undefined;
      }
    | undefined;
}
