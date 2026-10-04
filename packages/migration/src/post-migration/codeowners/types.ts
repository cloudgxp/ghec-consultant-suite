export interface TeamReferenceMatch {
  readonly original: string;
  readonly sourceOrg: string;
  readonly sourceTeam: string;
  readonly targetOrg: string;
  readonly targetTeam: string;
  readonly replacement: string;
  readonly line: number;
}

export interface CodeownersFileCandidate {
  readonly path: string;
  readonly sha: string;
  readonly rawContent: string;
  readonly decodedContent: string;
}

export interface CodeownersFileDiff {
  readonly path: string;
  readonly sha: string;
  readonly originalContent: string;
  readonly updatedContent: string;
  readonly matches: readonly TeamReferenceMatch[];
  readonly hasChanges: boolean;
}

export interface CodeownersData {
  readonly repository: string;
  readonly defaultBranch: string;
  readonly files: readonly CodeownersFileCandidate[];
}

export interface CodeownersModuleOptions {
  readonly teamSlugMap?: Readonly<Record<string, string>> | undefined;
  readonly mode?: 'direct-commit' | 'pull-request' | 'auto' | undefined;
  readonly defaultBranch?: string | undefined;
}

export interface RawContentResponse {
  readonly name?: string | undefined;
  readonly path?: string | undefined;
  readonly sha?: string | undefined;
  readonly type?: 'file' | 'dir' | undefined;
  readonly content?: string | undefined;
  readonly encoding?: string | undefined;
}
