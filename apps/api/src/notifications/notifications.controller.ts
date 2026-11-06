import { Body, Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { TenantId } from '../auth/tenant.decorator';
import { NotificationsService } from './notifications.service';

class RegisterDeviceDto {
  @IsString()
  @Matches(/^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/)
  token!: string;
  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';
}

class PreferencesDto {
  @IsBoolean()
  enabled!: boolean;
}

class TestSlackAlertDto {
  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  appName?: string;

  @IsOptional()
  @IsIn(['deployment_failed', 'service_unhealthy', 'deployment_success', 'test_alert'])
  eventType?: 'deployment_failed' | 'service_unhealthy' | 'deployment_success' | 'test_alert';

  @IsOptional()
  @IsString()
  message?: string;
}

@Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('preferences')
  getPreferences(@TenantId() tenantId: string) {
    return this.notifications.preferences(tenantId);
  }

  @Post('devices')
  register(@TenantId() tenantId: string, @Body() body: RegisterDeviceDto) {
    return this.notifications.registerDevice(tenantId, body.token, body.platform);
  }

  @Patch('preferences')
  update(@TenantId() tenantId: string, @Body() body: PreferencesDto) {
    return this.notifications.setEnabled(tenantId, body.enabled);
  }

  @Delete('devices')
  remove(@TenantId() tenantId: string, @Body() body: Pick<RegisterDeviceDto, 'token'>) {
    return this.notifications.removeDevice(tenantId, body.token);
  }

  @Get('slack/status')
  getSlackStatus() {
    return this.notifications.getSlackStatus();
  }

  @Post('slack/test')
  sendSlackTest(
    @TenantId() tenantId: string,
    @Body() body: TestSlackAlertDto,
  ) {
    return this.notifications.sendSlackTest(tenantId, body);
  }
}
