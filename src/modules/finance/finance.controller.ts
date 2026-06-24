import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  IsInt,
  IsMongoId,
  IsPositive,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { PermissionGuard } from 'src/platform/access-control/permission.guard';
import { ReadOnlySessionGuard } from 'src/platform/access-control/read-only-session.guard';
import {
  RequirePermission,
  ResolveResource,
} from 'src/platform/access-control/access-control.decorators';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { FinanceService } from './finance.service';

class CreateInvoiceRequestDto {
  @IsString()
  organizationId!: string;

  @IsMongoId()
  projectId!: string;

  @IsMongoId()
  clientId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  key!: string;

  @IsInt()
  @IsPositive()
  amountCents!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;
}

@Controller('invoice-requests')
@UseGuards(JwtAuthGuard, ReadOnlySessionGuard, PermissionGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get()
  @RequirePermission('finance.invoice.read')
  @ResolveResource({ type: 'MODULE', moduleKey: 'finance', allowProjectScope: true })
  async listInvoiceRequests(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return {
      items: await this.financeService.listInvoiceRequests(principal),
    };
  }

  @Post()
  @RequirePermission('finance.invoice.request')
  @ResolveResource({
    type: 'PROJECT',
    bodyField: 'projectId',
    moduleKey: 'finance',
  })
  async requestInvoice(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateInvoiceRequestDto,
  ) {
    const invoiceRequest = await this.financeService.requestInvoice(
      principal,
      dto,
    );
    return { id: invoiceRequest.id, status: invoiceRequest.status };
  }

  @Post(':invoiceRequestId/approve')
  @RequirePermission('finance.invoice.approve')
  @ResolveResource({
    type: 'INVOICE',
    param: 'invoiceRequestId',
    moduleKey: 'finance',
  })
  async approveInvoice(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('invoiceRequestId') invoiceRequestId: string,
  ) {
    const invoiceRequest = await this.financeService.approveInvoice(
      principal,
      invoiceRequestId,
    );
    return { id: invoiceRequest.id, status: invoiceRequest.status };
  }
}
