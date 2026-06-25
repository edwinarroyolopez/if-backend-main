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

  validateConnection(input: {
    apiKey: string;
    connectionId: string;
    projectKey: string;
    host: string;
  }): Promise<RuntimeValidateResult> {
    return this.request<RuntimeValidateResult>('/connections/validate', {
      method: 'POST',
      apiKey: input.apiKey,
      body: {
        connectionId: input.connectionId,
        projectKey: input.projectKey,
        host: input.host,
      },
    });
  }

  listRuntimeEndpoints(input: {
    apiKey: string;
    connectionId: string;
  }): Promise<RuntimeEndpointsResult> {
    return this.request<RuntimeEndpointsResult>(
      `/runtime/connections/${encodeURIComponent(input.connectionId)}/endpoints`,
      {
        method: 'GET',
        apiKey: input.apiKey,
      },
    );
  }

  private async request<T>(
    path: string,
    input: {
      method: 'GET' | 'POST';
      apiKey: string;
      body?: Record<string, string>;
    },
  ): Promise<T> {
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
      return payload as T;
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
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const value = (payload as { reasonCode?: unknown }).reasonCode;
  return typeof value === 'string' ? value : undefined;
}
