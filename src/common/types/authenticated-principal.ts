import { PrincipalType, SessionKind } from './domain.types';

export interface AuthenticatedPrincipal {
  sub: string;
  principalType: PrincipalType;
  sessionId: string;
  sessionVersion: number;
  authorizationVersion: number;
  sessionKind: SessionKind;
  readOnly: boolean;
  activeOrganizationId?: string;
  email?: string;
}
