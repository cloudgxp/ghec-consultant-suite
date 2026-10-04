import type {
  CodeownersFileCandidate,
  CodeownersFileDiff,
  TeamReferenceMatch,
} from './types.js';

const TEAM_REFERENCE_REGEX = /@([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/g;

export function rewriteTeamReferences(
  file: CodeownersFileCandidate,
  sourceOrg: string,
  targetOrg: string,
  teamSlugMap?: Readonly<Record<string, string>> | undefined,
): CodeownersFileDiff {
  const lines = file.decodedContent.split('\n');
  const matches: TeamReferenceMatch[] = [];
  const normalizedSourceOrg = sourceOrg.toLowerCase();

  const updatedLines = lines.map((line, index) => {
    return line.replace(
      TEAM_REFERENCE_REGEX,
      (original, orgSlug: string, teamSlug: string) => {
        if (orgSlug.toLowerCase() !== normalizedSourceOrg) {
          return original;
        }

        const mappedTeam =
          teamSlugMap?.[teamSlug] ??
          teamSlugMap?.[teamSlug.toLowerCase()] ??
          teamSlug;

        const replacement = `@${targetOrg}/${mappedTeam}`;
        matches.push({
          original,
          sourceOrg: orgSlug,
          sourceTeam: teamSlug,
          targetOrg,
          targetTeam: mappedTeam,
          replacement,
          line: index + 1,
        });

        return replacement;
      },
    );
  });

  const updatedContent = updatedLines.join('\n');
  const hasChanges = updatedContent !== file.decodedContent;

  return {
    path: file.path,
    sha: file.sha,
    originalContent: file.decodedContent,
    updatedContent,
    matches,
    hasChanges,
  };
}
