# TakeoutFix Gemini AI Studio Connector

This directory contains the Firebase Cloud Function (`geminiToolGateway`) which acts as a webhook gateway for Google AI Studio. 

It allows Gemini models to interact directly with your Firebase Firestore database using **Function Calling (Tools)** to query user quotas, update plans, manage support tickets, or suspend users.

---

## 1. Setup & Deployment

### Prerequisite: Enable Cloud Functions & Billing
Ensure that your Firebase project is on the **Blaze (pay-as-you-go) plan**, which is required to deploy Node.js 18+ Cloud Functions.

### Step 1: Install Dependencies
From the `webapp/functions/` directory, run:
```bash
npm install
```

### Step 2: Set Your Custom API Key Secret
To prevent unauthorized users from executing administrator actions on your database, configure a secret API Key. You can use any secret password/key.

Run the following command using the Firebase CLI:
```bash
npx firebase functions:config:set gemini.key="YOUR_CUSTOM_SECRET_KEY"
```

### Step 3: Deploy the Cloud Function
Go to the root `webapp` folder and deploy only the functions component:
```bash
npx firebase deploy --only functions
```

Once successful, Firebase CLI will output your HTTPS endpoint URL:
`https://us-central1-gt-metadata-merger.cloudfunctions.net/geminiToolGateway`

---

## 2. Setting Up Google AI Studio (Function Calling)

When designing a prompt/agent in **Google AI Studio**, go to the **Tools** section on the right-hand panel, enable **Function Calling**, and declare your functions. 

Use the following specifications for the tool declarations:

### A. API Header Authentication
Configure AI Studio or your agent connector to send the following headers:
```http
x-api-key: YOUR_CUSTOM_SECRET_KEY
Content-Type: application/json
```

### B. Function Definition Schema (JSON)
You can define these functions inside Google AI Studio. The gateway endpoint expects all tool calls to execute as a `POST` request to `https://<your-region>-<your-project>.cloudfunctions.net/geminiToolGateway/execute` with the function name and arguments in the request body.

#### 1. `getUserStats`
* **Description**: Retrieve user subscription tier, active device counts, and cumulative quota bytes/files used.
* **Arguments Schema**:
```json
{
  "name": "getUserStats",
  "description": "Retrieve user subscription details, suspension status, and cumulative usage statistics by email or UID.",
  "parameters": {
    "type": "OBJECT",
    "properties": {
      "emailOrUid": {
        "type": "STRING",
        "description": "The email address or Firebase UID of the target user."
      }
    },
    "required": ["emailOrUid"]
  }
}
```

#### 2. `updateUserPlan`
* **Description**: Upgrade or downgrade a user's plan and reset their active session trackers to 0. Generates an Admin Grant billing receipt.
* **Arguments Schema**:
```json
{
  "name": "updateUserPlan",
  "description": "Change a user's subscription tier and reset their active session quota counters back to 0.",
  "parameters": {
    "type": "OBJECT",
    "properties": {
      "emailOrUid": {
        "type": "STRING",
        "description": "The user's email or UID."
      },
      "newPlan": {
        "type": "STRING",
        "description": "The plan to apply. Must be one of: 'free', 'single_pass', 'pro', 'super', 'family'."
      }
    },
    "required": ["emailOrUid", "newPlan"]
  }
}
```

#### 3. `toggleUserSuspension`
* **Description**: Suspend or restore a user account. Suspended accounts are immediately locked out of the tool.
* **Arguments Schema**:
```json
{
  "name": "toggleUserSuspension",
  "description": "Suspend or unsuspend a user account to grant or block access to the app.",
  "parameters": {
    "type": "OBJECT",
    "properties": {
      "emailOrUid": {
        "type": "STRING",
        "description": "The user's email or UID."
      },
      "suspend": {
        "type": "BOOLEAN",
        "description": "Set to true to suspend, false to restore."
      }
    },
    "required": ["emailOrUid", "suspend"]
  }
}
```

#### 4. `getSupportTickets`
* **Description**: Fetch support tickets submitted by users.
* **Arguments Schema**:
```json
{
  "name": "getSupportTickets",
  "description": "Retrieve recent support tickets from the database, optionally filtered by status.",
  "parameters": {
    "type": "OBJECT",
    "properties": {
      "status": {
        "type": "STRING",
        "description": "Filter tickets by status. E.g. 'OPEN', 'RESOLVED', 'ANSWERED'."
      }
    }
  }
}
```

#### 5. `replyToTicket`
* **Description**: Send a reply message to a user ticket and optionally resolve it.
* **Arguments Schema**:
```json
{
  "name": "replyToTicket",
  "description": "Send an admin reply response to a user support ticket and mark it as RESOLVED or ANSWERED.",
  "parameters": {
    "type": "OBJECT",
    "properties": {
      "ticketId": {
        "type": "STRING",
        "description": "The document ID of the support ticket."
      },
      "replyText": {
        "type": "STRING",
        "description": "The markdown or text response to send to the user."
      },
      "resolve": {
        "type": "BOOLEAN",
        "description": "Set to true to mark the ticket status as RESOLVED."
      }
    },
    "required": ["ticketId", "replyText"]
  }
}
```

---

## 3. How the Request Payload Works
When Gemini decides to execute a function, the request sent to `/execute` looks like:
```json
{
  "functionName": "getUserStats",
  "arguments": {
    "emailOrUid": "user@example.com"
  }
}
```

And the connector returns standard JSON payloads containing response metrics which Gemini can read to answer the user's questions in real time.
