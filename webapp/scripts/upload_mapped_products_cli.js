const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const activeProducts = {
  "in": {
    "recovery_pass": "pdt_0Nh9Zks2AQYFkZDDPZ4WU",
    "pro": "pdt_0Nh9Zktw0jXm6ud31Jzhs",
    "super": "pdt_0Nh9ZkvbWR95UGjweWsGR"
  },
  "t1": {
    "recovery_pass": "pdt_0Nh9Zl6GYXA5pIg4vbqcq",
    "pro": "pdt_0Nh9Zl7aupVuFeY3bbpbx",
    "super": "pdt_0Nh9Zl8zmz0lnRJFgujtm"
  },
  "t2": {
    "recovery_pass": "pdt_0Nh9ZlDNl76WFLSCMzHv1",
    "pro": "pdt_0Nh9ZlF1jy8xSfL7IbJQw",
    "super": "pdt_0Nh9ZlGhyiNuBT5mM7wSD"
  },
  "t3": {
    "recovery_pass": "pdt_0Nh9ZlKubzBh1PcIOD64s",
    "pro": "pdt_0Nh9ZlMI0FBKuCyiMcI3X",
    "super": "pdt_0Nh9ZlNm9cRPWBZgwPabw"
  },
  "t4": {
    "recovery_pass": "pdt_0Nh9ZlSkNpF6d3Bllc5In",
    "pro": "pdt_0Nh9ZlUHayGCApkmqZD2Z",
    "super": "pdt_0Nh9ZlVvZutleMEjxhLpx"
  },
  "eu": {
    "recovery_pass": "pdt_0Nh9ZlaGXniogv1NgkIe1",
    "pro": "pdt_0Nh9Zld1zXm1ZhkbZUmhA",
    "super": "pdt_0Nh9ZleRd8nQZXpYhZL1p"
  },
  "jp": {
    "recovery_pass": "pdt_0Nh9ZliZk0JqPMIyo4xY8",
    "pro": "pdt_0Nh9Zlm1Z8CtEhpXPJr9n",
    "super": "pdt_0Nh9ZlnRCQnG1nyFLhyqA"
  },
  "cn": {
    "recovery_pass": "pdt_0Nh9ZltDGH3Esa67c8z9S",
    "pro": "pdt_0Nh9Zlwi7EnYFn9ZpMPLY",
    "super": "pdt_0Nh9ZlyKb3cwIf2XJH4s9"
  }
};

const fullProducts = {
  "in": {
    "pro": "pdt_0Nh9Zl0UTmszMvgYkOGP7",
    "super": "pdt_0Nh9Zl3xmvzG0p9pr2n1t"
  },
  "t1": {
    "pro": "pdt_0Nh9ZlAPPDcYEw3EerYg1",
    "super": "pdt_0Nh9ZlBv64Hj7cGQwKHuF"
  },
  "t2": {
    "pro": "pdt_0Nh9ZlIAdDAOfPcZvsS8r",
    "super": "pdt_0Nh9ZlJYlmcXa0GHO46hn"
  },
  "t3": {
    "pro": "pdt_0Nh9ZlPeUWO5VpB3wva4n",
    "super": "pdt_0Nh9ZlREj7rcNS1BPl9O5"
  },
  "t4": {
    "pro": "pdt_0Nh9ZlXNUiimhccg7Ljfz",
    "super": "pdt_0Nh9ZlYn7oVNNYzQYyvM5"
  },
  "eu": {
    "pro": "pdt_0Nh9ZlfpnIo88P6SuYsQw",
    "super": "pdt_0Nh9ZlhCOYmIo13UIG8Ld"
  },
  "jp": {
    "pro": "pdt_0Nh9ZlovLHLPhsa4gRPvv",
    "super": "pdt_0Nh9ZlriNJ6GzUw94Wsia"
  },
  "cn": {
    "pro": "pdt_0Nh9Zm0QVsVeCpqErLgmE",
    "super": "pdt_0Nh9Zm25H0v5F5wXT7vBk"
  }
};

async function getAccessToken() {
  const configPath = '/home/rahul/.config/configstore/firebase-tools.json';
  if (!fs.existsSync(configPath)) {
    throw new Error('Firebase tools configuration file not found at: ' + configPath);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const refreshToken = config.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error('Refresh token not found in firebase-tools.json');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: '1007822452206-258sguamvsv15glssiga9p8sqbj6s49c.apps.googleusercontent.com',
      client_secret: '3E9nY9v8D188Gg4D483gDg0A',
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!res.ok) {
    throw new Error('Failed to refresh token: ' + (await res.text()));
  }

  const tokenData = await res.json();
  return tokenData.access_token;
}

async function run() {
  console.log("Starting Firestore product mapping upload via OAuth token...");
  const accessToken = await getAccessToken();
  console.log("Successfully generated access token!");

  admin.initializeApp({
    credential: admin.credential.oauthToken(accessToken),
    projectId: 'gt-metadata-merger'
  });

  const db = admin.firestore();
  console.log("Writing mappings to /settings/global...");
  await db.collection("settings").doc("global").set({
    dodo_products: activeProducts,
    dodo_products_full: fullProducts,
    dodo_test_mode: true
  }, { merge: true });

  console.log("✅ Mappings uploaded successfully!");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
