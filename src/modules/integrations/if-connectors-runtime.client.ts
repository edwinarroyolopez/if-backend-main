import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';

type RuntimeConnectionStatus = 'CREATED' | 'CONNECTED' | 'BLOCKED' | 'REVOKED';

export type RuntimeEndpointMetadata = {
  id: string;
  key: string;
  name: string;
  method: 'GET' | 'POST';
  path: string;
  status: 'ACTIVE';
};

type RuntimeConnectionMetadata = {
  id: string;
  connectorId?: string;
  projectKey?: string;
  host?: string;
  status: RuntimeConnectionStatus;
  apiKeyPrefix?: string;
  connectedAt?: string;
  blockedReason?: string;
  lastUsedAt?: string;
  lastSyncedAt?: string;
};

type RuntimeConnectorMetadata = {
  id: string;
  key: string;
  name: string;
  status: 'ACTIVE';
};

export type RuntimeValidateResult = {
  connection: RuntimeConnectionMetadata;
  connector?: RuntimeConnectorMetadata;
  endpoints?: RuntimeEndpointMetadata[];
};

export type RuntimeEndpointsResult = {
  connection: RuntimeConnectionMetadata;
  endpoints?: RuntimeEndpointMetadata[];
};

@Injectable()
export class IfConnectorsRuntimeClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.getOrThrow<string>(
      'app.ifConnectorsBaseUrl',
    );
    this.timeoutMs = this.configService.getOrThrow<number>(
      'app.ifConnectorsTimeoutMs',
    );
  }

  async validateConnection(input: {
    apiKey: string;
    connectionId: string;
    projectKey: string;
    host: string;
  }): Promise<RuntimeValidateResult> {
    const payload = await this.request('/connections/validate', {
      method: 'POST',
      apiKey: input.apiKey,
      body: {
        connectionId: input.connectionId,
        projectKey: input.projectKey,
        host: input.host,
      },
    });
    return parseValidateResult(payload);
  }

  async listRuntimeEndpoints(input: {
    apiKey: string;
    connectionId: string;
  }): Promise<RuntimeEndpointsResult> {
    const payload = await this.request(
      `/runtime/connections/${encodeURIComponent(input.connectionId)}/endpoints`,
      {
        method: 'GET',
        apiKey: input.apiKey,
      },
    );
    return parseEndpointsResult(payload);
  }

  private async request(
    path: string,
    input: {
      method: 'GET' | 'POST';
      apiKey: string;
      body?: Record<string, string>;
    },
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: input.method,
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          Accept: 'application/json',
          ...(input.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
        signal: controller.signal,
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw mapRemoteError(response.status, payload);
      }
      return payload;
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException(
        502,
        REASON_CODES.PROJECT_CONNECTOR_REMOTE_UNAVAILABLE,
        'IF Connectors runtime is unavailable',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseValidateResult(payload: unknown): RuntimeValidateResult {
  const record = requireRecord(payload);
  return {
    connection: parseConnection(record.connection),
    connector: record.connector ? parseConnector(record.connector) : undefined,
    endpoints: record.endpoints ? parseEndpoints(record.endpoints) : undefined,
  };
}

function parseEndpointsResult(payload: unknown): RuntimeEndpointsResult {
  const record = requireRecord(payload);
  return {
    connection: parseConnection(record.connection),
    endpoints: record.endpoints ? parseEndpoints(record.endpoints) : undefined,
  };
}

function parseConnection(value: unknown): RuntimeConnectionMetadata {
  const record = requireRecord(value);
  const status = requireOneOf(record.status, [
    'CREATED',
    'CONNECTED',
    'BLOCKED',
    'REVOKED',
  ] as const);
  return {
    id: requireString(record.id),
    connectorId: optionalString(record.connectorId),
    projectKey: optionalString(record.projectKey),
    host: optionalString(record.host),
    status,
    apiKeyPrefix: optionalString(record.apiKeyPrefix),
    connectedAt: optionalString(record.connectedAt),
    blockedReason: optionalString(record.blockedReason),
    lastUsedAt: optionalString(record.lastUsedAt),
    lastSyncedAt: optionalString(record.lastSyncedAt),
  };
}

function parseConnector(value: unknown): RuntimeConnectorMetadata {
  const record = requireRecord(value);
  return {
    id: requireString(record.id),
    key: requireString(record.key),
    name: requireString(record.name),
    status: requireOneOf(record.status, ['ACTIVE'] as const),
  };
}

function parseEndpoints(value: unknown): RuntimeEndpointMetadata[] {
  if (!Array.isArray(value)) throwInvalidRuntimeResponse();
  return value.map((item) => {
    const record = requireRecord(item);
    return {
      id: requireString(record.id),
      key: requireString(record.key),
      name: requireString(record.name),
      method: requireOneOf(record.method, ['GET', 'POST'] as const),
      path: requireString(record.path),
      status: requireOneOf(record.status, ['ACTIVE'] as const),
    };
  });
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throwInvalidRuntimeResponse();
  }
  return value;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throwInvalidRuntimeResponse();
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function requireOneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throwInvalidRuntimeResponse();
  }
  return value;
}

function throwInvalidRuntimeResponse(): never {
  throw new AppException(
    502,
    REASON_CODES.PROJECT_CONNECTOR_REMOTE_UNAVAILABLE,
    'IF Connectors runtime returned an invalid response',
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AppException(
      502,
      REASON_CODES.PROJECT_CONNECTOR_REMOTE_UNAVAILABLE,
      'IF Connectors runtime returned invalid JSON',
    );
  }
}

function mapRemoteError(status: number, payload: unknown): AppException {
  const reasonCode = getRemoteReasonCode(payload);
  if (status === 401) {
    return new AppException(
      401,
      REASON_CODES.PROJECT_CONNECTOR_REMOTE_AUTH_FAILED,
      'IF Connectors runtime rejected the API key',
      { remoteStatus: status, remoteReasonCode: reasonCode },
    );
  }
  if (reasonCode === 'CONNECTOR_CONNECTION_REVOKED') {
    return new AppException(
      409,
      REASON_CODES.PROJECT_CONNECTOR_REMOTE_REVOKED,
      'IF Connectors runtime reports the connection is revoked',
      { remoteStatus: status, remoteReasonCode: reasonCode },
    );
  }
  return new AppException(
    502,
    REASON_CODES.PROJECT_CONNECTOR_SYNC_FAILED,
    'IF Connectors runtime request failed',
    { remoteStatus: status, remoteReasonCode: reasonCode },
  );
}

function getRemoteReasonCode(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  const value = payload.reasonCode;
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
