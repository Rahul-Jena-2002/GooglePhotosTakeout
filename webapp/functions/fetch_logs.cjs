const { GoogleAuth } = require("google-auth-library");
const path = require("path");

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, "serviceAccountKey.json");

async function fetchLogs() {
  const auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/logging.read"
  });
  
  const client = await auth.getClient();
  const projectId = await auth.getProjectId();
  
  console.log(`Using Project ID: ${projectId}`);
  
  const url = "https://logging.googleapis.com/v2/entries:list";
  const body = {
    resourceNames: [`projects/${projectId}`],
    filter: `resource.type="cloud_function" AND resource.labels.function_name="geminiToolGateway"`,
    orderBy: "timestamp desc",
    pageSize: 30
  };
  
  const res = await client.request({
    url,
    method: "POST",
    data: body
  });
  
  const entries = res.data.entries || [];
  console.log(`\nFetched ${entries.length} log entries:\n`);
  
  entries.reverse().forEach(entry => {
    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "N/A";
    const text = entry.textPayload || (entry.jsonPayload ? JSON.stringify(entry.jsonPayload) : "");
    const severity = entry.severity || "INFO";
    console.log(`[${time}] [${severity}] ${text}`);
  });
}

fetchLogs().catch(err => {
  console.error("Error fetching logs:", err.message);
  if (err.response && err.response.data) {
    console.error("Response error data:", JSON.stringify(err.response.data, null, 2));
  }
});
