import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import { ConnectorSecretCryptoService } from './connector-secret-crypto.service';
import { RuntimeValidateResult } from './if-connectors-runtime.client';
import { toDate, toEndpointMirrors } from './project-connector-mirror.mapper';
import { ProjectConnectorMirrorDocument } from './project-connector-mirror.schema';

export type ProjectRecord = {
  id: string;
  organizationId: string;
  key: string;
};

export async function upsertMirrorFromRemote(
  deps: {
    mirrorModel: HydratedModel<ProjectConnectorMirrorDocument>;
    secretCrypto: ConnectorSecretCryptoService;
  },
  input: {
    principal: AuthenticatedPrincipal;
    project: ProjectRecord;
    apiKey: string;
    host: string;
    remote: RuntimeValidateResult;
  },
) {
  const now = new Date();
  const status = input.remote.connection.status;
  const mirror = await deps.mirrorModel.findOneAndUpdate(
    {
      organizationId: input.project.organizationId,
      projectId: input.project.id,
      remoteConnectionId: input.remote.connection.id,
    },
    {
      $set: {
        remoteConnectorId:
          input.remote.connector?.id ?? input.remote.connection.connectorId,
        connectorKey: input.remote.connector?.key,
        connectorName: input.remote.connector?.name,
        projectKey: input.project.key,
        host: input.host,
        apiKeyCiphertext: deps.secretCrypto.encrypt(input.apiKey),
        apiKeyPrefix: input.remote.connection.apiKeyPrefix,
        status,
        connectedAt: toDate(input.remote.connection.connectedAt),
        blockedAt: status === 'BLOCKED' ? now : undefined,
        blockedReason: input.remote.connection.blockedReason,
        lastSyncedAt: toDate(input.remote.connection.lastSyncedAt) ?? now,
        lastUsedAt: toDate(input.remote.connection.lastUsedAt),
        endpoints: toEndpointMirrors(input.remote.endpoints ?? []),
        updatedByUserId: input.principal.sub,
      },
      $setOnInsert: {
        organizationId: input.project.organizationId,
        projectId: input.project.id,
        remoteConnectionId: input.remote.connection.id,
        createdByUserId: input.principal.sub,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  if (!mirror) {
    throw new AppException(
      500,
      REASON_CODES.INTERNAL_ERROR,
      'Connector mirror could not be stored',
    );
  }
  return mirror;
}
