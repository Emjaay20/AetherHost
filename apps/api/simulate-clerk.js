const { Webhook } = require('svix');

async function test() {
  const secret = 'whsec_dummy_secret_for_testing_123';
  const payload = {
    data: {
      id: 'user_2TestSimulation123',
      first_name: 'Test',
      last_name: 'User',
      email_addresses: [{ email_address: 'test@example.com' }]
    },
    object: 'event',
    type: 'user.created'
  };

  const wh = new Webhook(secret);
  const headers = wh.sign(payload);

  try {
    const res = await fetch('http://localhost:3000/v1/webhooks/clerk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Body:', data);
  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}

test();
