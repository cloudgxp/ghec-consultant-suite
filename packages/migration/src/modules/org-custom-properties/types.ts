export type CustomPropertyType =
  'string' | 'single_select' | 'multi_select' | 'true_false';

export interface CustomPropertyDefinition {
  readonly propertyName: string;
  readonly valueType: CustomPropertyType;
  readonly description?: string | undefined;
  readonly required: boolean;
  readonly defaultValue?: string | readonly string[] | boolean | undefined;
  readonly allowedValues: readonly string[];
}

export interface OrgCustomPropertiesData {
  readonly organization: string;
  readonly definitions: readonly CustomPropertyDefinition[];
}

export interface RawCustomPropertyDefinition {
  readonly property_name?: string | undefined;
  readonly value_type?: CustomPropertyType | undefined;
  readonly description?: string | undefined;
  readonly required?: boolean | undefined;
  readonly default_value?: string | readonly string[] | boolean | undefined;
  readonly allowed_values?: readonly string[] | undefined;
}
