import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProjectsService } from 'src/modules/projects/projects.service';
import { ResourceScopeService } from 'src/platform/access-control/resource-scope.service';
import { ResourceScopeResolver } from 'src/platform/access-control/resource-scope.types';
import { AuditService } from 'src/platform/audit/audit.service';
import { TransactionManagerService } from 'src/platform/database/transaction-manager.service';
import { OutboxService } from 'src/platform/events/outbox.service';
import { IdempotencyService } from 'src/platform/idempotency/idempotency.service';
import { IdentityService } from 'src/platform/identity/identity.service';
import { FlightOpsOperations } from './flight-ops-terminal.operations';
import {
  MissionMediaAsset,
  MissionMediaAssetDocument,
} from './mission-media-asset.schema';
import { MissionMediaStoragePort } from './mission-media-storage.port';
import { Mission, MissionDocument } from './mission.schema';
import { PilotAssignmentPolicy } from './pilot-assignment-policy.service';

type OperationMethod = (...args: unknown[]) => unknown;

function bindOperations(target: FlightOpsService, source: FlightOpsOperations) {
  let prototype = Object.getPrototypeOf(source) as object | null;
  while (prototype && prototype !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === 'constructor' || Reflect.get(target, name) !== undefined) {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      const method = descriptor?.value as OperationMethod | undefined;
      if (typeof method === 'function') {
        Object.defineProperty(target, name, {
          configurable: true,
          enumerable: false,
          value: method.bind(source),
        });
      }
    }
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
}

@Injectable()
export class FlightOpsService implements ResourceScopeResolver, OnModuleInit {
  acceptMission!: FlightOpsOperations['acceptMission'];
  assignMission!: FlightOpsOperations['assignMission'];
  cancelMission!: FlightOpsOperations['cancelMission'];
  completeMission!: FlightOpsOperations['completeMission'];
  createMission!: FlightOpsOperations['createMission'];
  failMission!: FlightOpsOperations['failMission'];
  getMission!: FlightOpsOperations['getMission'];
  listMissions!: FlightOpsOperations['listMissions'];
  onModuleInit!: FlightOpsOperations['onModuleInit'];
  rejectMission!: FlightOpsOperations['rejectMission'];
  resolve!: FlightOpsOperations['resolve'];
  reviewCloseMission!: FlightOpsOperations['reviewCloseMission'];
  startMission!: FlightOpsOperations['startMission'];
  supports!: FlightOpsOperations['supports'];
  uploadMissionMedia!: FlightOpsOperations['uploadMissionMedia'];

  private readonly operations: FlightOpsOperations;

  constructor(
    @InjectModel(Mission.name)
    missionModel: Model<MissionDocument>,
    @InjectModel(MissionMediaAsset.name)
    mediaAssetModel: Model<MissionMediaAssetDocument>,
    projectsService: ProjectsService,
    resourceScopeService: ResourceScopeService,
    transactionManagerService: TransactionManagerService,
    idempotencyService: IdempotencyService,
    auditService: AuditService,
    outboxService: OutboxService,
    identityService: IdentityService,
    mediaStorage: MissionMediaStoragePort,
    pilotAssignmentPolicy: PilotAssignmentPolicy,
  ) {
    this.operations = new FlightOpsOperations(
      missionModel,
      mediaAssetModel,
      projectsService,
      resourceScopeService,
      transactionManagerService,
      idempotencyService,
      auditService,
      outboxService,
      identityService,
      mediaStorage,
      pilotAssignmentPolicy,
    );
    bindOperations(this, this.operations);
  }
}

export type FlightOpsPublicContract = Pick<
  FlightOpsService,
  | 'acceptMission'
  | 'assignMission'
  | 'cancelMission'
  | 'completeMission'
  | 'createMission'
  | 'failMission'
  | 'getMission'
  | 'listMissions'
  | 'rejectMission'
  | 'reviewCloseMission'
  | 'startMission'
  | 'uploadMissionMedia'
>;
