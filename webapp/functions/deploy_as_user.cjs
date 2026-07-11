const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

async function deploy() {
  console.log("Loading Firebase CLI credentials...");
  const configPath = "/home/rahul/.config/configstore/firebase-tools.json";
  if (!fs.existsSync(configPath)) {
    console.error(`❌ Firebase config file not found at ${configPath}`);
    return;
  }
  
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const refreshToken = config.tokens?.refresh_token;
  
  if (!refreshToken) {
    console.error("❌ No refresh token found in firebase-tools.json config!");
    return;
  }
  
  console.log("🟢 Found active Firebase CLI session token.");
  console.log("Running firebase deploy command using your user token...");
  
  const cmd = `npx -y firebase-tools@latest deploy --only functions --token "${refreshToken}" --project takeout-fix`;
  
  // Execute the command, inheriting stdout and stderr so we see progress in real-time
  execSync(cmd, {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit"
  });
  
  console.log("\n🟢 Deployment successful!");
}

deploy().catch(err => {
  console.error("❌ Deployment failed:", err.message);
});
