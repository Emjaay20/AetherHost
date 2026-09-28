const http = require('http');
const req = http.request('http://127.0.0.1:3000/v1/billing/webhooks/bachs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-bachs-signature': '03ae2c3aa46df15003c5b06d1d62f620e5565dcb29b02f4bbb1ad1311a5a1d23'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', data));
});
req.write('{"test":"true"}');
req.end();
