export interface RepositoryCustomPropertyValue {
  readonly propertyName: string;
  readonly value: string | readonly string[] | boolean | null;
}

export interface RepoCustomPropertiesData {
  readonly repository: string;
  readonly values: readonly RepositoryCustomPropertyValue[];
}

export interface RawRepositoryCustomPropertyValue {
  readonly property_name?: string | undefined;
  readonly value?: string | readonly string[] | boolean | null | undefined;
}
