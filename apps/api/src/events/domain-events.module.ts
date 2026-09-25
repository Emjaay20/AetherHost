import { Global, Module } from '@nestjs/common';
import { DomainEventsService } from './domain-events.service';
import { DomainEventsController } from './domain-events.controller';

@Global()
@Module({
  controllers: [DomainEventsController],
  providers: [DomainEventsService],
  exports: [DomainEventsService],
})
export class DomainEventsModule {}
