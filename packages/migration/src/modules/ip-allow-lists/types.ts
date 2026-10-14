/**
 * Domain types for IP Allow Lists & CIDR Restrictions migration module.
 */

export interface IpAllowListEntry {
  readonly id?: string | undefined;
  readonly name?: string | undefined;
  readonly cidr: string;
  readonly isActive: boolean;
}

export interface IpAllowListsData {
  readonly organization: string;
  readonly ownerId?: string | undefined;
  readonly entries: readonly IpAllowListEntry[];
}

export interface RawGraphQLIpAllowListNode {
  readonly id?: string | null | undefined;
  readonly name?: string | null | undefined;
  readonly cidr?: string | null | undefined;
  readonly isActive?: boolean | null | undefined;
}

export interface RawGraphQLIpAllowListResponse {
  readonly organization?:
    | {
        readonly id?: string | null | undefined;
        readonly ipAllowListEntries?:
          | {
              readonly nodes?:
                | readonly (RawGraphQLIpAllowListNode | null)[]
                | null
                | undefined;
            }
          | null
          | undefined;
      }
    | null
    | undefined;
}
