import fs from 'fs';
import https from 'https';

const config = JSON.parse(fs.readFileSync('/home/rahul/.config/configstore/firebase-tools.json', 'utf8'));
const accessToken = config.tokens.access_token;
const refreshToken = config.tokens.refresh_token;

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function getFreshAccessToken(refresh) {
  const clientId = "1014389776834-8o4rgc66upa3hgn73g2eul3o8e63e26m.apps.googleusercontent.com";
  const clientSecret = "Ym174NCiQg5475s5G2IxgL3y";
  const url = 'https://oauth2.googleapis.com/token';
  const body = {
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refresh
  };
  const res = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  console.log("getFreshAccessToken status:", res.status);
  return res.data.access_token;
}

async function run() {
  let token = accessToken;
  try {
    let res = await request('https://firestore.googleapis.com/v1/projects/gt-metadata-merger/databases/(default)/documents/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log("Initial test check status:", res.status);
    if (res.status === 401) {
      token = await getFreshAccessToken(refreshToken);
    }
  } catch (err) {
    console.error("Test check failed, refreshing token...", err);
    token = await getFreshAccessToken(refreshToken);
  }

  console.log("Token value:", token ? "Exists" : "Undefined");

  // Fetch users
  const usersRes = await request('https://firestore.googleapis.com/v1/projects/gt-metadata-merger/databases/(default)/documents/users', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("usersRes status:", usersRes.status);
  if (usersRes.status === 200) {
    console.log("Users fetched successfully");
  } else {
    console.log("usersRes data:", usersRes.data || usersRes.body);
  }
}

run().catch(console.error);
