const crypto = require('crypto');
const http = require('http');

const secret = process.env.BACHS_WEBHOOK_SECRET || 'whsec_dummy';

// 1. Create a mock Bachs payload for upgrading the user to the "growth" plan
const payload = {
  id: 'bachs_evt_' + Date.now(),
  type: 'payment.success',
  metadata: {
    tenantId: 'user_3K1xGX0gzLatvTSieLxpmbyZCH3', // The user's Clerk ID
    planId: 'growth' // Upgrade from starter (3 apps) to growth (10 apps)
  }
};
const payloadString = JSON.stringify(payload);

// 2. Cryptographically sign the payload exactly like Bachs does
const signature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

console.log('Sending payload:', payloadString);
console.log('With Signature:', signature);

// 3. Send the request
const req = http.request('http://127.0.0.1:3000/v1/billing/webhooks/bachs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-bachs-signature': signature
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`\nAPI Response (${res.statusCode}):`, data);
  });
});

req.write(payloadString);
req.end();
