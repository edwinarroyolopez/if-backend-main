import { ServiceAccountStatus } from 'src/common/types/domain.types';

export type ServicePrincipalRecord = {
  id: string;
  organizationId: string;
  status: ServiceAccountStatus;
  sessionVersion: number;
  authorizationVersion: number;
  allowedAudiences: string[];
};

export interface ServicePrincipalLookup {
  findServicePrincipalById(
    serviceAccountId: string,
  ): Promise<ServicePrincipalRecord | null>;
}

export const SERVICE_PRINCIPAL_LOOKUP = Symbol('SERVICE_PRINCIPAL_LOOKUP');
