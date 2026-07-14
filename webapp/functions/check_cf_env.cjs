const { GoogleAuth } = require("google-auth-library");
const path = require("path");

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, "serviceAccountKey.json");

async function checkCfEnv() {
  const auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/cloud-platform"
  });
  
  const client = await auth.getClient();
  const projectId = await auth.getProjectId();
  
  console.log(`Checking Cloud Functions for project: ${projectId}`);
  
  const url = `https://cloudfunctions.googleapis.com/v1/projects/${projectId}/locations/-/functions`;
  
  const res = await client.request({ url });
  const functionsList = res.data.functions || [];
  
  console.log(`Found ${functionsList.length} deployed functions.`);
  
  functionsList.forEach(fn => {
    console.log(`\nFunction: ${fn.name.split("/").pop()}`);
    console.log(` - EntryPoint: ${fn.entryPoint}`);
    console.log(` - Status:     ${fn.status}`);
    console.log(` - Timeout:    ${fn.timeout}`);
    console.log(` - Memory:     ${fn.availableMemoryMb}MB`);
    
    // Environment Variables
    const envVars = fn.environmentVariables || {};
    console.log(" - Environment Variables:");
    for (const key of Object.keys(envVars)) {
      const val = envVars[key];
      console.log(`    • ${key}: ${val ? (key.includes("KEY") || key.includes("SECRET") ? `SET (length ${val.length}, preview ${val.substring(0, 4)}...)` : val) : 'EMPTY'}`);
    }
    
    // Check v2 function environment if applicable
    if (fn.serviceConfig) {
      const v2Env = fn.serviceConfig.environmentVariables || {};
      console.log(" - Service Config (v2) Env:");
      for (const key of Object.keys(v2Env)) {
        const val = v2Env[key];
        console.log(`    • ${key}: ${val ? (key.includes("KEY") || key.includes("SECRET") ? `SET (length ${val.length})` : val) : 'EMPTY'}`);
      }
    }
  });
}

checkCfEnv().catch(err => {
  console.error("❌ Failed to fetch function details:", err.message);
  if (err.response && err.response.data) {
    console.error("Response error:", JSON.stringify(err.response.data, null, 2));
  }
});
