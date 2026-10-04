import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import type { EvaluatedInsights } from '@ghec/analysis';
import { ActionList, Button, Dialog, Label, TextInput } from '@primer/react';
import { Blankslate } from '@primer/react/experimental';
import { SearchIcon } from '@primer/octicons-react';
import { resolveOrgName } from '../lib/formatters.js';

export interface GlobalSearchSelection {
  id: string;
  organizationId: string;
  tab: string;
  subview?: string;
}

interface SearchItem extends GlobalSearchSelection {
  group: string;
  label: string;
  detail: string;
  searchable: string;
}

interface Props {
  bundle: DiscoveryBundle;
  insights: EvaluatedInsights;
  onSelect: (selection: GlobalSearchSelection) => void;
}

function score(searchable: string, query: string): number {
  if (!query) return 1;
  const exact = searchable.indexOf(query);
  if (exact >= 0) return 1000 - exact;
  let cursor = 0;
  let gaps = 0;
  for (const character of query) {
    const match = searchable.indexOf(character, cursor);
    if (match < 0) return -1;
    gaps += match - cursor;
    cursor = match + 1;
  }
  return 500 - gaps;
}

export const GlobalSearchModal: React.FC<Props> = ({
  bundle,
  insights,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);
  const index = useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = [];
    for (const entity of bundle.entities) {
      const organization = resolveOrgName(bundle, entity.organizationId);
      if (entity.kind === 'repository')
        items.push({
          id: entity.id,
          organizationId: entity.organizationId,
          tab: 'repositories',
          group: 'Repositories',
          label: entity.name,
          detail: `${organization} · ${entity.visibility} · ${entity.defaultBranch ?? 'unknown branch'}`,
          searchable:
            `${entity.name} ${entity.visibility} ${entity.defaultBranch ?? ''} ${organization}`.toLowerCase(),
        });
      if (entity.kind === 'team')
        items.push({
          id: entity.id,
          organizationId: entity.organizationId,
          tab: 'teams',
          group: 'Teams',
          label: entity.name,
          detail: `${organization} · parent ${entity.parentTeamId ?? 'none'}`,
          searchable:
            `${entity.name} ${entity.parentTeamId ?? ''} ${organization}`.toLowerCase(),
        });
      if (entity.kind === 'actions')
        for (const workflow of entity.workflowNames)
          items.push({
            id: entity.id,
            organizationId: entity.organizationId,
            tab: 'actions',
            subview: 'actions',
            group: 'Workflows',
            label: workflow,
            detail: `${organization} · ${entity.repositoryId}`,
            searchable:
              `${workflow} ${entity.repositoryId} ${organization}`.toLowerCase(),
          });
      if (entity.kind === 'action-workflow')
        items.push({
          id: entity.id,
          organizationId: entity.organizationId,
          tab: 'actions',
          subview: 'workflows',
          group: 'Workflows',
          label: entity.name,
          detail: `${organization} · ${entity.repositoryId} · ${entity.state}`,
          searchable:
            `${entity.name} ${entity.repositoryId} ${entity.state} ${organization}`.toLowerCase(),
        });
      if (entity.kind === 'action-runner')
        items.push({
          id: entity.id,
          organizationId: entity.organizationId,
          tab: 'actions',
          subview: 'runners',
          group: 'Runners',
          label: entity.name,
          detail: `${organization} · ${entity.runnerType} · ${entity.status}`,
          searchable:
            `${entity.name} ${entity.runnerType} ${entity.operatingSystem ?? ''} ${entity.labels.join(' ')} ${organization}`.toLowerCase(),
        });
      if (entity.kind === 'action-environment')
        items.push({
          id: entity.id,
          organizationId: entity.organizationId,
          tab: 'actions',
          subview: 'policies',
          group: 'Environments',
          label: entity.name,
          detail: `${organization} · ${entity.repositoryId}`,
          searchable:
            `${entity.name} ${entity.repositoryId} ${entity.deploymentBranchPolicy} ${organization}`.toLowerCase(),
        });
      if (entity.kind === 'actions-secret')
        items.push({
          id: entity.id,
          organizationId: entity.organizationId,
          tab: 'secrets-variables',
          group: 'Secrets & Variables',
          label: entity.name,
          detail: `${organization} · Actions · ${entity.level}`,
          searchable:
            `${entity.name} actions ${entity.level} ${entity.repositoryId ?? ''} ${organization}`.toLowerCase(),
        });
      if (entity.kind === 'configuration-metadata')
        items.push({
          id: entity.id,
          organizationId: entity.organizationId,
          tab: 'secrets-variables',
          group: 'Secrets & Variables',
          label: entity.name,
          detail: `${organization} · ${entity.domain} · ${entity.level}`,
          searchable:
            `${entity.name} ${entity.domain} ${entity.configurationKind} ${entity.level} ${entity.repositoryId ?? ''} ${organization}`.toLowerCase(),
        });
      if (entity.kind === 'project')
        items.push({
          id: entity.id,
          organizationId: entity.organizationId,
          tab: 'projects',
          group: 'Projects',
          label: entity.title,
          detail: `${organization} · ${entity.status} · ${entity.linkedRepositoryIds.length} repositories`,
          searchable:
            `${entity.title} ${entity.status} ${organization}`.toLowerCase(),
        });
      if (entity.kind === 'code-ownership')
        items.push({
          id: entity.id,
          organizationId: entity.organizationId,
          tab: 'code-ownership',
          group: 'Code Ownership',
          label: entity.repositoryId,
          detail: `${organization} · ${entity.presence} · ${entity.coverage}`,
          searchable:
            `${entity.repositoryId} ${entity.presence} ${entity.coverage} ${organization}`.toLowerCase(),
        });
      if (entity.kind === 'dependency-node')
        items.push({
          id: entity.id,
          organizationId: entity.organizationId,
          tab: 'dependency-map',
          group: 'Dependencies',
          label: entity.label,
          detail: `${organization} · ${entity.external ? 'external' : entity.scanned ? 'scanned' : 'unscanned'}`,
          searchable:
            `${entity.label} ${entity.stableKey} ${organization}`.toLowerCase(),
        });
      if (entity.kind === 'policy')
        items.push({
          id: entity.id,
          organizationId: entity.organizationId,
          tab: 'security',
          subview: 'policies',
          group: 'Policies & Rulesets',
          label: entity.name,
          detail: `${organization} · ${entity.policyKind}`,
          searchable:
            `${entity.name} ${entity.policyKind} ${entity.enforcement} ${organization}`.toLowerCase(),
        });
      if (entity.kind === 'security')
        items.push({
          id: entity.id,
          organizationId: entity.organizationId,
          tab: 'security',
          subview: 'security',
          group: 'Security',
          label: entity.repositoryId,
          detail: `${organization} · code scanning ${entity.codeScanning} · Dependabot ${entity.dependabot}`,
          searchable:
            `${entity.repositoryId} ${entity.codeScanning} ${entity.dependabot} ${organization}`.toLowerCase(),
        });
    }
    for (const finding of insights.findings)
      items.push({
        id: finding.id,
        organizationId: finding.organizationId,
        tab: 'readiness',
        group: 'Migration Findings',
        label: finding.title,
        detail: `${finding.ruleId} · ${finding.severity} · ${resolveOrgName(bundle, finding.organizationId)}`,
        searchable:
          `${finding.title} ${finding.description} ${finding.ruleId} ${finding.severity}`.toLowerCase(),
      });
    return items;
  }, [bundle, insights]);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return index
      .map((item) => ({ item, rank: score(item.searchable, needle) }))
      .filter((entry) => entry.rank >= 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 50)
      .map((entry) => entry.item);
  }, [index, query]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches(
        'input, textarea, select, [contenteditable="true"]',
      );
      if (
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') ||
        (event.key === '/' && !typing)
      ) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const choose = (item: SearchItem | undefined) => {
    if (!item) return;
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    onSelect(item);
  };
  if (!open)
    return (
      <Button
        ref={triggerRef}
        type="button"
        variant="invisible"
        size="small"
        onClick={() => setOpen(true)}
        aria-label="Open global search"
        leadingVisual={SearchIcon}
        className="min-h-11 min-w-11"
      >
        <span className="hidden sm:inline">Search</span>
        <span className="hidden sm:inline-flex ml-1.5 rounded border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--fgColor-muted)]">
          Ctrl K
        </span>
      </Button>
    );
  return (
    <Dialog
      title="Global search"
      onClose={close}
      initialFocusRef={inputRef}
      returnFocusRef={triggerRef}
      width="large"
      align="top"
    >
      <div className="p-3">
        <TextInput
          ref={inputRef}
          type="search"
          leadingVisual={SearchIcon}
          block
          size="large"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((value) =>
                Math.min(value + 1, results.length - 1),
              );
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((value) => Math.max(value - 1, 0));
            }
            if (event.key === 'Enter') choose(results[activeIndex]);
          }}
          placeholder="Search repositories, teams, workflows, policies, findings…"
          aria-label="Search"
          aria-controls="global-search-results"
          aria-activedescendant={
            results[activeIndex] ? `search-result-${activeIndex}` : undefined
          }
        />
      </div>
      <div
        id="global-search-results"
        role="listbox"
        className="max-h-[60vh] overflow-y-auto px-2 pb-2"
      >
        {results.length ? (
          <ActionList>
            {results.map((item, indexValue) => (
              <ActionList.Item
                id={`search-result-${indexValue}`}
                role="option"
                aria-selected={indexValue === activeIndex}
                key={`${item.group}:${item.id}:${indexValue}`}
                onMouseEnter={() => setActiveIndex(indexValue)}
                onSelect={() => choose(item)}
                active={indexValue === activeIndex}
              >
                <ActionList.LeadingVisual>
                  <Label variant="accent" size="small">
                    {item.group}
                  </Label>
                </ActionList.LeadingVisual>
                <span className="font-semibold">{item.label}</span>
                <ActionList.Description variant="block">
                  {item.detail}
                </ActionList.Description>
              </ActionList.Item>
            ))}
          </ActionList>
        ) : (
          <div className="py-6">
            <Blankslate>
              <Blankslate.Visual>
                <SearchIcon size={24} />
              </Blankslate.Visual>
              <Blankslate.Heading>
                No matching evidence found
              </Blankslate.Heading>
              <Blankslate.Description>
                Try searching for other repositories, teams, workflows,
                policies, or findings.
              </Blankslate.Description>
            </Blankslate>
          </div>
        )}
      </div>
      <div className="border-t border-[var(--borderColor-default)] px-4 py-2 text-[11px] text-[var(--fgColor-muted)]">
        ↑↓ navigate · Enter select · Esc close
      </div>
    </Dialog>
  );
};
