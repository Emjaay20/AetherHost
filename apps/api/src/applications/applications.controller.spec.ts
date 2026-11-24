import { ApplicationsController } from './applications.controller';

describe('ApplicationsController AetherPress template', () => {
  const originalOwner = process.env.AETHERPRESS_DEMO_OWNER_TENANT_ID;

  beforeEach(() => {
    process.env.AETHERPRESS_DEMO_OWNER_TENANT_ID = 'tenant_owner';
  });

  afterEach(() => {
    if (originalOwner === undefined) {
      delete process.env.AETHERPRESS_DEMO_OWNER_TENANT_ID;
    } else {
      process.env.AETHERPRESS_DEMO_OWNER_TENANT_ID = originalOwner;
    }
  });

  it('uses the source-runtime path rather than the pre-built-image workload contract', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'app_demo' });
    const controller = new ApplicationsController({ create } as never);

    await controller.createAetherPressLaunchpad('tenant_owner', 'tenant_owner', {
      wordpressSiteUrl: 'https://wordpress.org/news',
    });

    expect(create).toHaveBeenCalledWith(
      'tenant_owner',
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

  it('refuses another account even if it targets the owner tenant', async () => {
    const create = jest.fn();
    const controller = new ApplicationsController({ create } as never);

    expect(() =>
      controller.createAetherPressLaunchpad('tenant_owner', 'tenant_other', {}),
    ).toThrow('available only to its owner workspace');
    expect(create).not.toHaveBeenCalled();
  });

  it('fails closed until a single owner workspace is configured', async () => {
    delete process.env.AETHERPRESS_DEMO_OWNER_TENANT_ID;
    const controller = new ApplicationsController({ create: jest.fn() } as never);

    expect(() =>
      controller.createAetherPressLaunchpad('tenant_owner', 'tenant_owner', {}),
    ).toThrow('not enabled for this workspace');
  });
});
