import { validate } from 'class-validator';
import { CreateAetherPressLaunchpadDto } from './create-aetherpress-launchpad.dto';

describe('CreateAetherPressLaunchpadDto', () => {
  it('rejects a non-string WordPress URL before the template is created', async () => {
    const body = Object.assign(new CreateAetherPressLaunchpadDto(), { wordpressSiteUrl: 123 });
    expect(await validate(body)).not.toHaveLength(0);
  });

  it('accepts an HTTPS WordPress site URL', async () => {
    const body = Object.assign(new CreateAetherPressLaunchpadDto(), { wordpressSiteUrl: 'https://editorial.example.com' });
    expect(await validate(body)).toHaveLength(0);
  });
});
