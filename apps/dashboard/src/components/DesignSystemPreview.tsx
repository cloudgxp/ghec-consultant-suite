import { useState } from 'react';
import {
  Button,
  IconButton,
  ButtonGroup,
  ActionMenu,
  ActionList,
  Label,
  CounterLabel,
  StateLabel,
  Banner,
  Spinner,
  ProgressBar,
  FormControl,
  TextInput,
  Select,
  Checkbox,
  Radio,
  Dialog,
  PageHeader,
  NavList,
  useTheme,
} from '@primer/react';
import { Blankslate, Table } from '@primer/react/experimental';
import {
  RepoIcon,
  GitBranchIcon,
  CheckCircleIcon,
  AlertIcon,
  XCircleIcon,
  ShieldCheckIcon,
  GearIcon,
  SearchIcon,
  OrganizationIcon,
  PeopleIcon,
  DownloadIcon,
  MoonIcon,
  SunIcon,
  SyncIcon,
  TrashIcon,
} from '@primer/octicons-react';
import {
  VirtualizedTable,
  type VirtualizedColumn,
} from './VirtualizedTable.js';

interface VirtualizedRepoRow {
  id: string;
  name: string;
  visibility: string;
  diskUsage: string;
  rulesets: number;
}

const SAMPLE_VIRTUAL_DATA: VirtualizedRepoRow[] = Array.from(
  { length: 1000 },
  (_, index) => ({
    id: `R_${index + 1}`,
    name: `repo-service-${index + 1}`,
    visibility: index % 3 === 0 ? 'public' : 'private',
    diskUsage: `${((index * 13) % 450) + 12} MB`,
    rulesets: (index % 5) + 1,
  }),
);

const VIRTUAL_COLUMNS: readonly VirtualizedColumn<VirtualizedRepoRow>[] = [
  {
    header: 'Repository',
    cell: (row) => (
      <span className="font-semibold text-primary">{row.name}</span>
    ),
    width: '2fr',
  },
  {
    header: 'Visibility',
    cell: (row) => (
      <Label variant={row.visibility === 'public' ? 'accent' : 'default'}>
        {row.visibility}
      </Label>
    ),
    width: '1fr',
  },
  {
    header: 'Disk Usage',
    cell: (row) => row.diskUsage,
    width: '1fr',
  },
  {
    header: 'Rulesets',
    cell: (row) => <CounterLabel>{row.rulesets}</CounterLabel>,
    width: '1fr',
  },
];

export function DesignSystemPreview() {
  const { colorMode, setColorMode, resolvedColorMode } = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeNav, setActiveNav] = useState('overview');
  const [searchValue, setSearchValue] = useState('');
  const [scope, setScope] = useState('enterprise');
  const [includeArchived, setIncludeArchived] = useState(true);
  const [analysisType, setAnalysisType] = useState('full');

  return (
    <div className="min-h-screen p-4 sm:p-8">
      {/* 1. Header & Color Mode Selector */}
      <div className="mb-8 rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Label variant="accent" size="small">
                DASH-16 Spike
              </Label>
              <Label variant="default" size="small">
                React 19
              </Label>
              <Label variant="default" size="small">
                Air-Gapped
              </Label>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Primer React Design System Showcase
            </h1>
            <p className="mt-1 text-sm text-[var(--fgColor-muted)]">
              Validating GitHub Primer React components, primitive tokens, and
              offline styling compatibility.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--fgColor-muted)]">
              Theme Mode:
            </span>
            <ButtonGroup>
              <Button
                leadingVisual={SunIcon}
                variant={colorMode === 'day' ? 'primary' : 'default'}
                onClick={() => setColorMode('day')}
                size="small"
              >
                Day
              </Button>
              <Button
                leadingVisual={MoonIcon}
                variant={colorMode === 'night' ? 'primary' : 'default'}
                onClick={() => setColorMode('night')}
                size="small"
              >
                Night
              </Button>
              <Button
                leadingVisual={SyncIcon}
                variant={colorMode === 'auto' ? 'primary' : 'default'}
                onClick={() => setColorMode('auto')}
                size="small"
              >
                Auto ({resolvedColorMode})
              </Button>
            </ButtonGroup>
          </div>
        </div>
      </div>

      {/* 2. PageHeader & NavList Component Architecture */}
      <div className="mb-8 rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold">1. Structure & Navigation</h2>
        <div className="rounded-lg border border-[var(--borderColor-default)] p-4">
          <PageHeader>
            <PageHeader.TitleArea>
              <PageHeader.LeadingVisual>
                <RepoIcon size={24} />
              </PageHeader.LeadingVisual>
              <PageHeader.Title>
                Enterprise Migration Assessment
              </PageHeader.Title>
            </PageHeader.TitleArea>
            <PageHeader.Actions>
              <Button leadingVisual={DownloadIcon} size="small">
                Export Executive Report
              </Button>
              <Button
                leadingVisual={GearIcon}
                size="small"
                onClick={() => setDialogOpen(true)}
              >
                Configure Targets
              </Button>
            </PageHeader.Actions>
          </PageHeader>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-4">
            <div className="md:col-span-1">
              <NavList>
                <NavList.Group title="Assessment Views">
                  <NavList.Item
                    href="#overview"
                    aria-current={activeNav === 'overview' ? 'page' : 'false'}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveNav('overview');
                    }}
                  >
                    <NavList.LeadingVisual>
                      <RepoIcon />
                    </NavList.LeadingVisual>
                    Overview
                    <NavList.TrailingVisual>
                      <CounterLabel>1</CounterLabel>
                    </NavList.TrailingVisual>
                  </NavList.Item>

                  <NavList.Item
                    href="#repositories"
                    aria-current={
                      activeNav === 'repositories' ? 'page' : 'false'
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveNav('repositories');
                    }}
                  >
                    <NavList.LeadingVisual>
                      <GitBranchIcon />
                    </NavList.LeadingVisual>
                    Repositories
                    <NavList.TrailingVisual>
                      <CounterLabel>248</CounterLabel>
                    </NavList.TrailingVisual>
                  </NavList.Item>

                  <NavList.Item
                    href="#security"
                    aria-current={activeNav === 'security' ? 'page' : 'false'}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveNav('security');
                    }}
                  >
                    <NavList.LeadingVisual>
                      <ShieldCheckIcon />
                    </NavList.LeadingVisual>
                    Security Posture
                  </NavList.Item>

                  <NavList.Item
                    href="#organizations"
                    aria-current={
                      activeNav === 'organizations' ? 'page' : 'false'
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveNav('organizations');
                    }}
                  >
                    <NavList.LeadingVisual>
                      <OrganizationIcon />
                    </NavList.LeadingVisual>
                    Organizations
                    <NavList.TrailingVisual>
                      <CounterLabel>12</CounterLabel>
                    </NavList.TrailingVisual>
                  </NavList.Item>

                  <NavList.Item
                    href="#teams"
                    aria-current={activeNav === 'teams' ? 'page' : 'false'}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveNav('teams');
                    }}
                  >
                    <NavList.LeadingVisual>
                      <PeopleIcon />
                    </NavList.LeadingVisual>
                    Teams & Identities
                  </NavList.Item>
                </NavList.Group>
              </NavList>
            </div>

            <div className="rounded-lg border border-[var(--borderColor-default)] p-4 md:col-span-3">
              <h3 className="font-semibold capitalize">
                Selected View: {activeNav}
              </h3>
              <p className="mt-1 text-sm text-[var(--fgColor-muted)]">
                Demonstrating responsive layout with Primer NavList navigation
                hierarchy and status counters.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Action Components & Menus */}
      <div className="mb-8 rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold">
          2. Buttons, Groups & ActionMenus
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary Action</Button>
          <Button variant="default">Default Button</Button>
          <Button variant="danger" leadingVisual={TrashIcon}>
            Delete Item
          </Button>
          <Button variant="invisible">Invisible Action</Button>
          <IconButton icon={GearIcon} aria-label="Settings" />

          <ActionMenu>
            <ActionMenu.Button>Actions Menu ▾</ActionMenu.Button>
            <ActionMenu.Overlay width="medium">
              <ActionList>
                <ActionList.Item>
                  <ActionList.LeadingVisual>
                    <DownloadIcon />
                  </ActionList.LeadingVisual>
                  Export CSV Summary
                </ActionList.Item>
                <ActionList.Item>
                  <ActionList.LeadingVisual>
                    <DownloadIcon />
                  </ActionList.LeadingVisual>
                  Generate Executive PDF
                </ActionList.Item>
                <ActionList.Item>
                  <ActionList.LeadingVisual>
                    <SyncIcon />
                  </ActionList.LeadingVisual>
                  Compare Baseline Scan
                </ActionList.Item>
                <ActionList.Divider />
                <ActionList.Item variant="danger">
                  <ActionList.LeadingVisual>
                    <TrashIcon />
                  </ActionList.LeadingVisual>
                  Clear Ingested Bundle
                </ActionList.Item>
              </ActionList>
            </ActionMenu.Overlay>
          </ActionMenu>
        </div>
      </div>

      {/* 4. Labels, Badges & State Indicators */}
      <div className="mb-8 rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold">
          3. Labels, Counters & Statuses
        </h2>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label variant="default">Default</Label>
            <Label variant="primary">Primary</Label>
            <Label variant="accent">Accent</Label>
            <Label variant="success">Success</Label>
            <Label variant="attention">Attention</Label>
            <Label variant="severe">Severe</Label>
            <Label variant="danger">Danger</Label>
            <Label variant="done">Done</Label>
            <Label variant="sponsors">Sponsors</Label>
            <CounterLabel>42</CounterLabel>
            <CounterLabel scheme="primary">1,248</CounterLabel>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StateLabel status="issueOpened">Issue Open</StateLabel>
            <StateLabel status="issueClosed">Issue Closed</StateLabel>
            <StateLabel status="pullMerged">PR Merged</StateLabel>
            <StateLabel status="pullOpened">PR Open</StateLabel>
            <span className="flex items-center gap-1 text-sm">
              <CheckCircleIcon /> Cutover Ready
            </span>
            <span className="flex items-center gap-1 text-sm">
              <AlertIcon /> Needs Review
            </span>
            <span className="flex items-center gap-1 text-sm">
              <XCircleIcon /> Migration Blocker
            </span>
          </div>

          <div className="space-y-2">
            <Banner
              variant="info"
              title="Information"
              description="Collector execution finished across 6 modules without errors."
            />
            <Banner
              variant="success"
              title="Evaluation Complete"
              description="All repository policy criteria satisfied migration readiness thresholds."
            />
            <Banner
              variant="warning"
              title="Attention Required"
              description="Three repositories exceed recommended 5 GB size thresholds."
            />
            <Banner
              variant="critical"
              title="Critical Finding"
              description="Unmeasured Git LFS storage requires cutover bandwidth verification."
            />
          </div>
        </div>
      </div>

      {/* 5. Forms & Interactive Inputs */}
      <div className="mb-8 rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold">4. Forms, Inputs & Controls</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <FormControl>
              <FormControl.Label>Filter Repositories</FormControl.Label>
              <TextInput
                leadingVisual={SearchIcon}
                placeholder="Search by repository name or topic..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                block
              />
              <FormControl.Caption>
                Case-insensitive search matching repo names and language tags.
              </FormControl.Caption>
            </FormControl>

            <FormControl>
              <FormControl.Label>Target Platform</FormControl.Label>
              <Select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                block
              >
                <Select.Option value="enterprise">
                  GitHub Enterprise Cloud (GHEC)
                </Select.Option>
                <Select.Option value="emu">
                  Enterprise Managed Users (EMU)
                </Select.Option>
                <Select.Option value="ghes">
                  GitHub Enterprise Server (GHES)
                </Select.Option>
              </Select>
            </FormControl>
          </div>

          <div className="space-y-4">
            <FormControl>
              <Checkbox
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
              <FormControl.Label>
                Include Archived Repositories
              </FormControl.Label>
              <FormControl.Caption>
                Analyze archived repositories for audit trail and compliance.
              </FormControl.Caption>
            </FormControl>

            <fieldset>
              <legend className="text-sm font-semibold">Analysis Scope</legend>
              <div className="mt-2 space-y-2">
                <FormControl>
                  <Radio
                    name="analysisType"
                    value="full"
                    checked={analysisType === 'full'}
                    onChange={() => setAnalysisType('full')}
                  />
                  <FormControl.Label>
                    Full Assessment (All 6 domains)
                  </FormControl.Label>
                </FormControl>
                <FormControl>
                  <Radio
                    name="analysisType"
                    value="fast"
                    checked={analysisType === 'fast'}
                    onChange={() => setAnalysisType('fast')}
                  />
                  <FormControl.Label>
                    Fast Triage (Metadata only)
                  </FormControl.Label>
                </FormControl>
              </div>
            </fieldset>

            <div>
              <p className="mb-1 text-xs font-medium">
                Batch Ingestion Progress
              </p>
              <ProgressBar progress={68} />
              <div className="mt-3 flex items-center gap-3">
                <Spinner size="small" />
                <span className="text-xs text-[var(--fgColor-muted)]">
                  Processing repository dependency graph (68%)...
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Empty States (Blankslate) */}
      <div className="mb-8 rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold">
          5. Empty & Error States (Blankslate)
        </h2>
        <div className="rounded-lg border border-[var(--borderColor-default)] p-4">
          <Blankslate>
            <Blankslate.Visual>
              <SearchIcon size="medium" />
            </Blankslate.Visual>
            <Blankslate.Heading>
              No Repositories Match Filters
            </Blankslate.Heading>
            <Blankslate.Description>
              There are no repositories matching the query &ldquo;
              {searchValue || 'sample'}&rdquo;. Try adjusting your search
              criteria or reset filters.
            </Blankslate.Description>
            <Blankslate.PrimaryAction href="#clear">
              Clear Search Filter
            </Blankslate.PrimaryAction>
          </Blankslate>
        </div>
      </div>

      {/* 7. Ordinary Table (Primer Table) */}
      <div className="mb-8 rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold">
          6. Ordinary Table (Primer Table)
        </h2>
        <Table.Container>
          <Table.Title as="h3" id="sample-repos-title">
            Sample Repositories
          </Table.Title>
          <Table.Subtitle id="sample-repos-subtitle">
            Demonstrating Primer Table component for standard small-to-medium
            datasets.
          </Table.Subtitle>
          <Table>
            <Table.Head>
              <Table.Row>
                <Table.Header>Repository</Table.Header>
                <Table.Header>Visibility</Table.Header>
                <Table.Header>Disk Usage</Table.Header>
                <Table.Header>Readiness</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              <Table.Row>
                <Table.Cell>
                  <span className="font-semibold text-primary">core-api</span>
                </Table.Cell>
                <Table.Cell>
                  <Label variant="default">private</Label>
                </Table.Cell>
                <Table.Cell>245 MB</Table.Cell>
                <Table.Cell>
                  <StateLabel status="pullMerged">Ready</StateLabel>
                </Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell>
                  <span className="font-semibold text-primary">
                    web-frontend
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <Label variant="accent">public</Label>
                </Table.Cell>
                <Table.Cell>89 MB</Table.Cell>
                <Table.Cell>
                  <StateLabel status="issueOpened">Review</StateLabel>
                </Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell>
                  <span className="font-semibold text-primary">
                    payments-service
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <Label variant="default">private</Label>
                </Table.Cell>
                <Table.Cell>1.2 GB</Table.Cell>
                <Table.Cell>
                  <StateLabel status="pullMerged">Ready</StateLabel>
                </Table.Cell>
              </Table.Row>
            </Table.Body>
          </Table>
        </Table.Container>
      </div>

      {/* 8. Virtualized Table with Primer Token Theme */}
      <div className="mb-8 rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold">
          7. Virtualized Table with Primer Tokens (1,000 Rows)
        </h2>
        <p className="mb-4 text-sm text-[var(--fgColor-muted)]">
          Maintains high-performance windowing (`@tanstack/react-virtual`) while
          applying Primer primitive border, text, and hover tokens.
        </p>
        <VirtualizedTable
          ariaLabel="Sample virtualized repositories table"
          rows={SAMPLE_VIRTUAL_DATA}
          columns={VIRTUAL_COLUMNS}
          getRowKey={(row) => row.id}
          emptyMessage="No repositories available."
          maxHeight={320}
        />
      </div>

      {/* 9. Interactive Dialog Modal */}
      {dialogOpen && (
        <Dialog
          title="Configure Migration Targets"
          subtitle="Set policy thresholds and remediation rule priorities"
          onClose={() => setDialogOpen(false)}
          footerButtons={[
            {
              content: 'Cancel',
              onClick: () => setDialogOpen(false),
            },
            {
              content: 'Save Configuration',
              buttonType: 'primary',
              onClick: () => setDialogOpen(false),
            },
          ]}
        >
          <div className="space-y-4 p-3">
            <p className="text-sm">
              Adjust migration parameters for target environment cutovers:
            </p>
            <FormControl>
              <FormControl.Label>Repository Size Limit (MB)</FormControl.Label>
              <TextInput defaultValue="5000" block />
            </FormControl>
            <FormControl>
              <FormControl.Label>Strict Ruleset Enforcement</FormControl.Label>
              <Checkbox defaultChecked />
              <FormControl.Caption>
                Enforce branch protection checks before cutover sign-off.
              </FormControl.Caption>
            </FormControl>
          </div>
        </Dialog>
      )}
    </div>
  );
}
