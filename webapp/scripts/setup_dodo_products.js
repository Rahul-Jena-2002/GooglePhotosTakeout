import fs from 'fs';
import path from 'path';

const REGIONS = {
  in: { name: 'India', currency: 'INR', recovery: 249, pro: 799, super: 1499 },
  t1: { name: 'Tier 1', currency: 'USD', recovery: 1.99, pro: 9.99, super: 19.99 },
  t2: { name: 'Tier 2', currency: 'USD', recovery: 3.99, pro: 19.00, super: 39.00 },
  t3: { name: 'Tier 3', currency: 'USD', recovery: 4.99, pro: 29.00, super: 49.00 },
  t4: { name: 'Tier 4', currency: 'USD', recovery: 5.99, pro: 39.00, super: 69.00 },
  eu: { name: 'Europe', currency: 'EUR', recovery: 4.99, pro: 29.00, super: 49.00 },
  jp: { name: 'Japan', currency: 'JPY', recovery: 899, pro: 5900, super: 9900 },
  cn: { name: 'China', currency: 'CNY', recovery: 49, pro: 199, super: 399 }
};

const dodoApiKey = process.env.DODO_API_KEY || "7RM41OfN1w8XWVR2.DcyoI7MMlg5Ydc_EMOlG_om2QE8hGxOHsgpa9-gdpZAaapWO";

// Check dry-run mode
const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');

// Helper to determine the final product currency and amount in minor units (cents/paise)
// Note: JPY and CNY must be converted to USD base products since Dodo API only supports USD, INR, GBP, EUR.
function getDodoProductConfig(region, basePrice, discountPercent) {
  let currency = region.currency;
  let finalPrice = discountPercent ? (basePrice * (1 - discountPercent / 100)) : basePrice;
  
  if (currency === 'JPY') {
    currency = 'USD';
    finalPrice = finalPrice / 150.0; // 1 USD = 150 JPY exchange rate
  } else if (currency === 'CNY') {
    currency = 'USD';
    finalPrice = finalPrice / 7.25; // 1 USD = 7.25 CNY exchange rate
  }
  
  // All target currencies (USD, INR, EUR) have 2 decimal places.
  const amount = Math.round(finalPrice * 100);
  return { currency, amount };
}

// Convert normal JS object to Firestore document REST value structure
function valueToFirestore(value) {
  if (value === null) {
    return { nullValue: null };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(valueToFirestore)
      }
    };
  }
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      fields[k] = valueToFirestore(v);
    }
    return {
      mapValue: {
        fields
      }
    };
  }
  throw new Error(`Unsupported value type: ${typeof value}`);
}

async function createDodoProduct(name, amount, currency, apiKey, isTest) {
  const baseUrl = isTest ? "https://test.dodopayments.com/products" : "https://live.dodopayments.com/products";
  
  const payload = {
    name,
    tax_category: "digital_products",
    price: {
      type: "one_time_price",
      currency: currency.toUpperCase(),
      price: amount,
      discount: 0,
      purchasing_power_parity: false
    }
  };

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create product "${name}": ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return data.product_id;
}

// REST Client fallback for Firestore write using Firebase CLI access token
async function saveToFirestoreREST(activeProducts, fullProducts) {
  console.log("Attempting to write to Firestore via REST API using Firebase CLI credentials...");
  
  // Read firebase-tools.json CLI tokens
  const configHome = process.env.HOME || "/home/rahul";
  const configPath = path.join(configHome, '.config/configstore/firebase-tools.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Firebase tools configuration file not found at ${configPath}. Please login with 'firebase login' first.`);
  }

  const firebaseToolsConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const tokens = firebaseToolsConfig.tokens || {};
  let accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;

  if (!accessToken && !refreshToken) {
    throw new Error("No active credentials found in firebase-tools.json. Run 'firebase login' to authenticate.");
  }

  // Refresh token if needed
  async function refreshAccessToken(rToken) {
    console.log("Refreshing Firebase CLI access token...");
    const clientId = "1014389776834-8o4rgc66upa3hgn73g2eul3o8e63e26m.apps.googleusercontent.com";
    const clientSecret = "Ym174NCiQg5475s5G2IxgL3y";
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: rToken
      })
    });
    if (!refreshRes.ok) {
      const text = await refreshRes.text();
      throw new Error(`Failed to refresh token: ${refreshRes.status} - ${text}`);
    }
    const data = await refreshRes.json();
    return data.access_token;
  }

  if (!accessToken) {
    accessToken = await refreshAccessToken(refreshToken);
  }

  async function tryPatch(token) {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/gt-metadata-merger/databases/(default)/documents/settings/global?updateMask.fieldPaths=dodo_products&updateMask.fieldPaths=dodo_products_full`;
    const requestBody = {
      fields: {
        dodo_products: valueToFirestore(activeProducts).mapValue,
        dodo_products_full: valueToFirestore(fullProducts).mapValue
      }
    };
    
    return fetch(firestoreUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
  }

  let res = await tryPatch(accessToken);
  if (res.status === 401 && refreshToken) {
    accessToken = await refreshAccessToken(refreshToken);
    res = await tryPatch(accessToken);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`REST API write returned error status ${res.status}: ${text}`);
  }

  console.log("✅ Successfully wrote product maps to settings/global in Firestore!");
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`📦 TakeoutFix Dodo Payments Product Setup Wizard`);
  console.log(`🔧 Mode: ${isDryRun ? "DRY-RUN (No API calls or writes)" : "PROVISIONING"}`);
  console.log(`🔑 Dodo Key: ${dodoApiKey ? `${dodoApiKey.substring(0, 10)}...` : "None"}`);
  console.log(`======================================================\n`);

  if (!dodoApiKey) {
    console.error("❌ Error: Missing Dodo Payments API Key.");
    console.log("Please specify the key by setting the environment variable DODO_API_KEY:");
    console.log("Example: DODO_API_KEY=sk_live_... node scripts/setup_dodo_products.js\n");
    process.exit(1);
  }

  const isTest = dodoApiKey.startsWith("sk_test_") || dodoApiKey.startsWith("test_");
  console.log(`🌐 Target Dodo Environment: ${isTest ? "TEST (test.dodopayments.com)" : "LIVE (live.dodopayments.com)"}\n`);

  const activeProducts = {};
  const fullProducts = {};

  const keys = Object.keys(REGIONS);

  for (const regionCode of keys) {
    const region = REGIONS[regionCode];
    activeProducts[regionCode] = {};
    fullProducts[regionCode] = {};

    console.log(`------------------------------------------------------`);
    console.log(`🌍 Region: ${region.name} (${regionCode.toUpperCase()}) [Currency: ${region.currency}]`);
    console.log(`------------------------------------------------------`);

    // 1. Recovery Pass
    const recoveryName = `TakeoutFix Recovery Pass — ${region.name}`;
    const recoveryConf = getDodoProductConfig(region, region.recovery, 0);
    let recoveryProductId = `mock_recovery_${regionCode}`;
    if (!isDryRun) {
      recoveryProductId = await createDodoProduct(recoveryName, recoveryConf.amount, recoveryConf.currency, dodoApiKey, isTest);
    } else {
      console.log(`[DRY-RUN] Create Product: "${recoveryName}" | Dodo Currency: ${recoveryConf.currency} | Dodo Price: ${recoveryConf.amount / 100} | Minor units: ${recoveryConf.amount}`);
    }
    activeProducts[regionCode].recovery_pass = recoveryProductId;

    // 2. Pro Founding (15% off)
    const proFoundingName = `TakeoutFix Pro Lifetime — ${region.name} (Founding)`;
    const proFoundingConf = getDodoProductConfig(region, region.pro, 15);
    let proFoundingId = `mock_pro_founding_${regionCode}`;
    if (!isDryRun) {
      proFoundingId = await createDodoProduct(proFoundingName, proFoundingConf.amount, proFoundingConf.currency, dodoApiKey, isTest);
    } else {
      console.log(`[DRY-RUN] Create Product: "${proFoundingName}" | Dodo Currency: ${proFoundingConf.currency} | Dodo Price: ${proFoundingConf.amount / 100} | Minor units: ${proFoundingConf.amount}`);
    }
    activeProducts[regionCode].pro = proFoundingId;

    // 3. Super Founding (10% off)
    const superFoundingName = `TakeoutFix Super Lifetime — ${region.name} (Founding)`;
    const superFoundingConf = getDodoProductConfig(region, region.super, 10);
    let superFoundingId = `mock_super_founding_${regionCode}`;
    if (!isDryRun) {
      superFoundingId = await createDodoProduct(superFoundingName, superFoundingConf.amount, superFoundingConf.currency, dodoApiKey, isTest);
    } else {
      console.log(`[DRY-RUN] Create Product: "${superFoundingName}" | Dodo Currency: ${superFoundingConf.currency} | Dodo Price: ${superFoundingConf.amount / 100} | Minor units: ${superFoundingConf.amount}`);
    }
    activeProducts[regionCode].super = superFoundingId;

    // 4. Pro Full Price
    const proFullName = `TakeoutFix Pro Lifetime — ${region.name} (Full Price)`;
    const proFullConf = getDodoProductConfig(region, region.pro, 0);
    let proFullId = `mock_pro_full_${regionCode}`;
    if (!isDryRun) {
      proFullId = await createDodoProduct(proFullName, proFullConf.amount, proFullConf.currency, dodoApiKey, isTest);
    } else {
      console.log(`[DRY-RUN] Create Product: "${proFullName}" | Dodo Currency: ${proFullConf.currency} | Dodo Price: ${proFullConf.amount / 100} | Minor units: ${proFullConf.amount}`);
    }
    fullProducts[regionCode].pro = proFullId;

    // 5. Super Full Price
    const superFullName = `TakeoutFix Super Lifetime — ${region.name} (Full Price)`;
    const superFullConf = getDodoProductConfig(region, region.super, 0);
    let superFullId = `mock_super_full_${regionCode}`;
    if (!isDryRun) {
      superFullId = await createDodoProduct(superFullName, superFullConf.amount, superFullConf.currency, dodoApiKey, isTest);
    } else {
      console.log(`[DRY-RUN] Create Product: "${superFullName}" | Dodo Currency: ${superFullConf.currency} | Dodo Price: ${superFullConf.amount / 100} | Minor units: ${superFullConf.amount}`);
    }
    fullProducts[regionCode].super = superFullId;

    console.log("");
  }

  console.log(`======================================================`);
  console.log(`📊 Mapping Generation Summary`);
  console.log(`======================================================`);
  console.log("Active Products Map (dodo_products):", JSON.stringify(activeProducts, null, 2));
  console.log("\nFull Price Products Map (dodo_products_full):", JSON.stringify(fullProducts, null, 2));

  if (!isDryRun) {
    console.log("\n💾 Writing product mappings to Firestore...");
    
    // Attempt Admin SDK first if configured, otherwise fallback to REST CLI
    let adminWritten = false;
    try {
      const admin = await import('firebase-admin');
      let serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (!serviceAccountPath && fs.existsSync('./service-account.json')) {
        serviceAccountPath = './service-account.json';
      }

      if (serviceAccountPath || process.env.FIREBASE_CONFIG || process.env.FIRESTORE_EMULATOR_HOST) {
        if (admin.apps.length === 0) {
          if (serviceAccountPath) {
            const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
            admin.initializeApp({
              credential: admin.credential.cert(serviceAccount)
            });
          } else {
            admin.initializeApp();
          }
        }
        const db = admin.firestore();
        await db.collection("settings").doc("global").set({
          dodo_products: activeProducts,
          dodo_products_full: fullProducts
        }, { merge: true });
        console.log("✅ Successfully wrote product maps to Firestore using Admin SDK!");
        adminWritten = true;
      }
    } catch (adminErr) {
      console.log(`ℹ️ Admin SDK setup skipped or failed: ${adminErr.message}. Falling back to REST API.`);
    }

    if (!adminWritten) {
      await saveToFirestoreREST(activeProducts, fullProducts);
    }
  }

  console.log(`\n🎉 Wizard Finished successfully!`);
}

run().then(() => process.exit(0)).catch(err => {
  console.error(`\n❌ Error occurred:`, err.message);
  process.exit(1);
});
