import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { CurrentPrincipal } from 'src/platform/access-control/current-principal.decorator';
import { ReadOnlySessionGuard } from 'src/platform/access-control/read-only-session.guard';
import { JwtAuthGuard } from 'src/platform/sessions/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, ReadOnlySessionGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async listOwn(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return {
      items: await this.notificationsService.listOwn({
        organizationId: principal.activeOrganizationId!,
        userId: principal.sub,
        unreadOnly: unreadOnly === 'true',
      }),
    };
  }

  @Post(':notificationId/read')
  async markRead(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.markRead({
      organizationId: principal.activeOrganizationId!,
      userId: principal.sub,
      notificationId,
    });
  }

  @Post('read-all')
  async markAllRead(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.notificationsService.markAllRead({
      organizationId: principal.activeOrganizationId!,
      userId: principal.sub,
    });
  }
}
