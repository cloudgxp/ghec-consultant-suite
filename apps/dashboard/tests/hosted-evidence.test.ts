import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  deriveDiscoveryHydrationFromBundle,
  probeHostedEvidence,
} from '../src/lib/importer.js';
import { SAMPLE_ORGANIZATION_BUNDLE } from '../src/lib/samples.js';
import { sampleDiscrepantVerificationReport } from '../src/lib/verification-diff.js';

describe('TASK-075, TASK-076 & TASK-077: Hosted Private GitHub Pages Evidence Auto-Hydration & CSS Parity', () => {
  it('hydrates discovery bundle, verification report, and results-hydration.json when ./evidence/*.json endpoints return 200 JSON', async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('discovery-bundle.json')) {
        return new Response(JSON.stringify(SAMPLE_ORGANIZATION_BUNDLE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('verification-report.json')) {
        return new Response(
          JSON.stringify(sampleDiscrepantVerificationReport),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
      if (url.endsWith('results-hydration.json')) {
        return new Response(
          JSON.stringify({
            schemaVersion: '1.0.0',
            operationalMode: 'live',
            manifest: {
              schemaVersion: '1.0.0',
              runId: 'run-live-01',
              generatedAt: '2026-10-19T12:00:00Z',
              sourceOrg: 'src-org',
              targetOrg: 'tgt-org',
              summary: {
                totalRepositories: 1,
                succeededCount: 1,
                failedCount: 0,
                successRatePercent: 100,
                durationMs: 12000,
                orgModulesSummary: [],
              },
              repositories: [],
            },
            transferStrategies: {
              geiRepos: ['demo'],
            },
            repoStrategyBadges: { demo: 'GEI Cloud Transfer' },
            postCare: {
              summary: {
                totalItems: 1,
                secretCount: 1,
                appCount: 0,
                webhookCount: 0,
                runnerCount: 0,
                otherCount: 0,
                identityAndAccessCount: 0,
                governanceAndRemediationCount: 0,
                skippedArchivedCount: 0,
              },
              items: [
                {
                  id: 'PC-001',
                  priority: 'high',
                  category: 'secret',
                  scopeLevel: 'organization',
                  targetOrg: 'tgt-org',
                  repository: null,
                  moduleId: 'org-secrets',
                  resourceName: 'PROD_DEPLOY_TOKEN',
                  actionRequired:
                    'Populate secret value ([SEALED] placeholder)',
                  settingsUrl:
                    'https://github.com/organizations/tgt-org/settings/secrets/actions',
                  settingsLinkLabel: 'Organization Actions Secrets',
                  cliCommand: 'gh secret set PROD_DEPLOY_TOKEN --org tgt-org',
                  notes: 'Secret value is never transferred.',
                },
              ],
              operationRows: [],
              skippedArchivedRows: [],
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
      return new Response('Not Found', { status: 404 });
    };

    const result = await probeHostedEvidence({ fetchFn: mockFetch });
    assert.equal(result.found, true);
    assert.equal(result.bundleResult?.success, true);
    if (result.bundleResult?.success) {
      assert.equal(
        result.bundleResult.bundle.organizations.length,
        SAMPLE_ORGANIZATION_BUNDLE.organizations.length,
      );
    }
    assert.ok(result.verificationReport);
    assert.equal(
      result.verificationReport?.reportId,
      sampleDiscrepantVerificationReport.reportId,
    );
    assert.ok(result.resultsHydration);
    assert.equal(result.resultsHydration?.operationalMode, 'live');
    assert.equal(result.resultsHydration?.postCare.items.length, 1);
    assert.equal(
      result.resultsHydration?.postCare.items[0]?.category,
      'secret',
    );
  });

  it('derives discovery-mode post-care hydration items from a DiscoveryBundle when results-hydration.json is absent', () => {
    const derived = deriveDiscoveryHydrationFromBundle(
      SAMPLE_ORGANIZATION_BUNDLE,
    );
    assert.equal(derived.operationalMode, 'discovery');
    assert.ok(Array.isArray(derived.postCare.items));
    assert.ok(derived.postCare.summary);
  });

  it('synthesizes a schema-valid DiscoveryBundle when discovery-bundle.json is 404 but manifest.json and migration-scope.json exist', async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('manifest.json')) {
        return new Response(
          JSON.stringify({
            runId: 'run-target-org',
            sourceOrg: 'source-org',
            targetOrg: 'target-org',
            generatedAt: '2026-10-19T05:00:00.000Z',
            repositories: [
              { sourceRepo: 'demo', targetRepo: 'demo' },
              { sourceRepo: 'WebKit', targetRepo: 'WebKit' },
            ],
            summary: {
              transferStrategies: {
                archivedRepos: ['WebKit'],
                lfs: { repos: ['demo'] },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('migration-scope.json')) {
        return new Response(
          JSON.stringify({
            version: '1.0.0',
            name: 'source-org-to-target-org',
            organizations: [{ source: 'source-org', target: 'target-org' }],
            repositories: [
              {
                sourceOrg: 'source-org',
                sourceRepo: 'demo',
                targetOrg: 'target-org',
                targetRepo: 'demo',
                useGei: true,
              },
              {
                sourceOrg: 'source-org',
                sourceRepo: 'WebKit',
                targetOrg: 'target-org',
                targetRepo: 'WebKit',
                useGei: false,
                archived: true,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('verification-report.json')) {
        return new Response(
          JSON.stringify(sampleDiscrepantVerificationReport),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not Found', { status: 404 });
    };

    const result = await probeHostedEvidence({ fetchFn: mockFetch });
    assert.equal(result.found, true);
    assert.equal(result.bundleResult?.success, true);
    if (result.bundleResult?.success) {
      assert.equal(
        result.bundleResult.bundle.organizations[0]?.id,
        'source-org',
      );
      assert.equal(result.bundleResult.bundle.summary.repositoryCount, 2);
      const webkitRepo = result.bundleResult.bundle.entities.find(
        (e) => e.kind === 'repository' && e.name === 'WebKit',
      );
      assert.ok(webkitRepo && webkitRepo.kind === 'repository');
      assert.equal(webkitRepo.archived, true);
    }
  });

  it('falls back silently (found: false) when endpoints return 404 or Vite SPA HTML fallback', async () => {
    const mockSpaFallbackFetch: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('discovery-bundle.json')) {
        return new Response('<!doctype html><html><body>SPA</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response('Not Found', { status: 404 });
    };

    const result = await probeHostedEvidence({ fetchFn: mockSpaFallbackFetch });
    assert.equal(result.found, false);
    assert.equal(result.bundleResult, undefined);
    assert.equal(result.verificationReport, undefined);
  });

  it('defines every utility CSS class used in apps/dashboard/src/**/*.tsx inside src/styles/index.css', () => {
    const srcDir = join(import.meta.dirname, '../src');
    const cssPath = join(srcDir, 'styles/index.css');
    const htmlPath = join(import.meta.dirname, '../index.html');
    const css = readFileSync(cssPath, 'utf-8');
    const html = readFileSync(htmlPath, 'utf-8');

    assert.ok(
      html.includes('data-color-mode="auto"') &&
        html.includes('data-light-theme="light"') &&
        html.includes('data-dark-theme="dark"'),
      'Expected index.html to declare Primer color-mode attributes on <html>',
    );
    assert.ok(
      css.includes('color-scheme: light dark;'),
      'Expected index.css to declare color-scheme: light dark on :root',
    );

    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
          out.push(full);
        }
      }
      return out;
    };

    const classes = new Set<string>();
    for (const file of walk(srcDir)) {
      const txt = readFileSync(file, 'utf-8');
      for (const m of txt.matchAll(/className="([^"]+)"/g)) {
        for (const t of (m[1] ?? '').split(/\s+/)) {
          if (t) classes.add(t);
        }
      }
      for (const m of txt.matchAll(/className=\{`([^`]+)`\}/g)) {
        const raw = m[1] ?? '';
        const staticPart = raw.replace(/\$\{[^}]+\}/g, ' ');
        for (const t of staticPart.split(/\s+/)) {
          if (t) classes.add(t);
        }
        for (const expr of raw.matchAll(/\$\{([^}]+)\}/g)) {
          const inner = expr[1] ?? '';
          const withoutCmp = inner.replace(/[!=]==?\s*["'][^"']+["']/g, '');
          for (const str of withoutCmp.matchAll(/["']([^"']+)["']/g)) {
            for (const t of (str[1] ?? '').split(/\s+/)) {
              if (t) classes.add(t);
            }
          }
        }
      }
    }

    const missing: string[] = [];
    for (const c of Array.from(classes).sort()) {
      const selector = '.' + c.replace(/[:[\]()/%.,]/g, '\\$&');
      if (!css.includes(selector)) {
        missing.push(c);
      }
    }

    assert.deepEqual(
      missing,
      [],
      `Missing CSS utility classes in apps/dashboard/src/styles/index.css: ${missing.join(', ')}`,
    );
  });
});
