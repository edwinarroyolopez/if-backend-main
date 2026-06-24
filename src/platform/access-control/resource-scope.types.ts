import { ScopeType } from 'src/common/types/domain.types';

export type ResourceReference = {
  resourceType: string;
  resourceId: string;
  moduleKey?: string;
  organizationId?: string;
};

export type ResourceScopeContext = {
  resourceType: string;
  resourceId: string;
  organizationId: string;
  moduleKey: string;
  candidateScopes: Array<{ type: ScopeType; id: string }>;
  projectId?: string;
  projectAccessRoleIds?: string[];
  allowProjectScope?: boolean;
};

export type ResolveResourceOptions = {
  type: string;
  param?: string;
  bodyField?: string;
  moduleKey?: string;
  allowProjectScope?: boolean;
};

export interface ResourceScopeResolver {
  supports(resourceType: string): boolean;
  resolve(reference: ResourceReference): Promise<ResourceScopeContext>;
}
