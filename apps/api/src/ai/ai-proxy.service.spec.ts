import { ForbiddenException } from '@nestjs/common';
import { AiProxyService } from './ai-proxy.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { DomainEventsService } from '../events/domain-events.service';
import { ModelFactory } from './model.factory';

describe('AiProxyService', () => {
  let service: AiProxyService;
  let entitlements: {
    canAiRequest: jest.Mock;
    consumeAiRequestSlot: jest.Mock;
  };
  let models: { get: jest.Mock };
  let events: { publish: jest.Mock };
  let prisma: { $transaction: jest.Mock };

  beforeEach(() => {
    entitlements = {
      canAiRequest: jest.fn(),
      consumeAiRequestSlot: jest.fn(),
    };
    models = {
      get: jest.fn(),
    };
    events = { publish: jest.fn() };
    prisma = {
      $transaction: jest.fn(async (fn) => fn({})),
    };
    service = new AiProxyService(
      prisma as unknown as PrismaService,
      entitlements as unknown as EntitlementsService,
      events as unknown as DomainEventsService,
      models as unknown as ModelFactory,
    );
  });

  it('does not call the model when quota is exhausted', async () => {
    entitlements.canAiRequest.mockResolvedValue({ allowed: false });
    const complete = jest.fn();
    models.get.mockReturnValue({ complete });

    await expect(
      service.complete('t1', 'hello', 'ops_insight'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(complete).not.toHaveBeenCalled();
    expect(entitlements.consumeAiRequestSlot).not.toHaveBeenCalled();
  });

  it('does not meter when the model adapter fails', async () => {
    entitlements.canAiRequest.mockResolvedValue({ allowed: true });
    models.get.mockReturnValue({
      complete: jest.fn().mockRejectedValue(new Error('provider 500')),
    });

    await expect(
      service.complete('t1', 'hello', 'ops_insight'),
    ).rejects.toThrow('provider 500');
    expect(entitlements.consumeAiRequestSlot).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('meters only after a successful completion', async () => {
    entitlements.canAiRequest.mockResolvedValue({ allowed: true });
    entitlements.consumeAiRequestSlot.mockResolvedValue(true);
    models.get.mockReturnValue({
      complete: jest.fn().mockResolvedValue({
        output: 'ok',
        model: 'stub',
        promptTokens: 4,
        completionTokens: 6,
      }),
    });

    const result = await service.complete('t1', 'hello', 'ops_insight');
    expect(result.output).toBe('ok');
    expect(entitlements.consumeAiRequestSlot).toHaveBeenCalledWith(
      't1',
      10,
      {},
    );
    expect(events.publish).toHaveBeenCalledTimes(1);
  });
});
