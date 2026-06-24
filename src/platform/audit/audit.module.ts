import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpPlatformModule } from 'src/platform/http/http.module';
import { AuditLog, AuditLogSchema } from './audit.schema';
import { AuditService } from './audit.service';

@Module({
  imports: [
    HttpPlatformModule,
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
