import fs from 'fs';
import path from 'path';

// 1. Read local .env if available
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      process.env[key] = val;
    }
  }
}

console.log('========================================');
console.log('   Zoom API & Endpoint Test Suite');
console.log('========================================');

const accountId = process.env.ZOOM_ACCOUNT_ID;
const clientId = process.env.ZOOM_CLIENT_ID;
const clientSecret = process.env.ZOOM_CLIENT_SECRET;

if (!accountId || !clientId || !clientSecret) {
  console.error('❌ Error: Missing ZOOM credentials in .env');
  process.exit(1);
}

// Dynamically import the handler from api/report.js
import handler from './api/report.js';

async function runTests() {
  try {
    // 1. Check OAuth directly
    console.log('1. Checking Zoom OAuth Token endpoint...');
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`OAuth HTTP ${tokenRes.status}: ${text}`);
    }

    const tokenData = await tokenRes.json();
    console.log(`✅ OAuth Success: Access Token obtained (valid for ${tokenData.expires_in}s)`);

    // 2. Test handler for today's date
    const today = new Date().toISOString().split('T')[0];
    console.log(`\n2. Testing api/report handler for TODAY (${today})...`);

    let statusCode = 200;
    let jsonResult = null;

    const mockReqToday = {
      method: 'GET',
      url: `/api/report?date=${today}`,
      query: { date: today }
    };
    const mockResToday = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResult = data;
        return this;
      }
    };

    await handler(mockReqToday, mockResToday);

    if (statusCode !== 200 || !Array.isArray(jsonResult)) {
      throw new Error(`Handler failed with HTTP ${statusCode}: ${JSON.stringify(jsonResult)}`);
    }

    console.log(`✅ Handler responded HTTP ${statusCode} OK.`);
    console.log(`   Found ${jsonResult.length} meetings for today (${today}).`);
    if (jsonResult.length > 0) {
      console.log('   Sample meeting for today:', jsonResult[0]);
    }

    // 3. Test handler for a date in the past 7 days where meetings might have occurred
    const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    console.log(`\n3. Testing api/report handler for past date (${pastDate})...`);

    statusCode = 200;
    jsonResult = null;

    const mockReqPast = {
      method: 'GET',
      url: `/api/report?date=${pastDate}`,
      query: { date: pastDate }
    };
    const mockResPast = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResult = data;
        return this;
      }
    };

    await handler(mockReqPast, mockResPast);

    if (statusCode !== 200 || !Array.isArray(jsonResult)) {
      throw new Error(`Handler failed with HTTP ${statusCode}: ${JSON.stringify(jsonResult)}`);
    }

    console.log(`✅ Handler responded HTTP ${statusCode} OK.`);
    console.log(`   Found ${jsonResult.length} meetings for ${pastDate}.`);
    if (jsonResult.length > 0) {
      console.log('   Sample meeting data:');
      console.log(JSON.stringify(jsonResult[0], null, 2));
    }

    console.log('\n========================================');
    console.log('🎉 ALL TESTS PASSED! API IS 100% OPERATIONAL');
    console.log('========================================');

  } catch (err) {
    console.error('\n❌ Test Error:', err);
    process.exit(1);
  }
}

runTests();
