/// <reference lib="webworker" />

import { validateBundle, type DiscoveryBundle } from '@ghec/contracts';
import { evaluateBundle, type EvaluatedInsights } from '@ghec/analysis';

export type ImportStage =
  'reading' | 'validating' | 'analyzing' | 'ready' | 'error';

export type ImportWorkerMessage =
  | { status: 'reading' | 'validating' | 'analyzing'; progress: number }
  | {
      status: 'ready';
      progress: 100;
      bundle: DiscoveryBundle;
      insights: EvaluatedInsights;
    }
  | { status: 'error'; progress: number; code: string; message: string };

function post(message: ImportWorkerMessage): void {
  self.postMessage(message);
}

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    post({ status: 'reading', progress: 5 });
    const text = await event.data.text();
    post({ status: 'reading', progress: 25 });

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      post({
        status: 'error',
        progress: 25,
        code: 'malformed_json',
        message:
          'Invalid JSON file. Confirm that the selected file is an unmodified discovery bundle.',
      });
      return;
    }

    post({ status: 'validating', progress: 40 });
    const validation = validateBundle(parsed);
    if (!validation.success) {
      post({
        status: 'error',
        progress: 70,
        code: validation.code,
        message: validation.message,
      });
      return;
    }

    post({ status: 'validating', progress: 70 });
    post({ status: 'analyzing', progress: 80 });
    const insights = evaluateBundle(validation.data);
    post({
      status: 'ready',
      progress: 100,
      bundle: validation.data,
      insights,
    });
  } catch {
    post({
      status: 'error',
      progress: 0,
      code: 'worker_error',
      message:
        'The bundle could not be processed. Try exporting it again or verify the schema version.',
    });
  }
};

export {};
