import { ApplicationsController } from './applications.controller';

describe('ApplicationsController AetherPress template', () => {
  it('uses the source-runtime path rather than the pre-built-image workload contract', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'app_demo' });
    const controller = new ApplicationsController({ create } as never);

    await controller.createAetherPressLaunchpad('tenant_1', {
      wordpressSiteUrl: 'https://wordpress.org/news',
    });

    expect(create).toHaveBeenCalledWith(
      'tenant_1',
      expect.stringMatching(/^aetherpress-launchpad-/),
      'nodejs',
      undefined,
      undefined,
      expect.any(Array),
      expect.any(String),
      expect.any(String),
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      false,
      false,
    );
  });
});
