/**
 * ArithFlow — Connector Setup Guides
 * Plain-language, step-by-step instructions for non-technical users.
 * Each guide tells exactly where to find credentials for each connector.
 */

export const CONNECTOR_GUIDES = {

  // ── File Connectors ─────────────────────────────────────────────────
  csv: {
    summary: "Upload a CSV file directly from your computer.",
    steps: [
      "Click the file browser or drag-and-drop your CSV file onto the upload area.",
      "ArithFlow will automatically detect column names and data types.",
      "Optionally set a delimiter (comma, semicolon, tab) if your file uses a non-standard format.",
    ],
    docsUrl: null,
    tip: "Files must be UTF-8 encoded. If you see garbled text, re-save your file from Excel as 'CSV UTF-8'.",
  },

  excel: {
    summary: "Upload an Excel (.xlsx) file from your computer.",
    steps: [
      "Click the file browser and select your .xlsx or .xls file.",
      "Specify the sheet name you want to import (defaults to the first sheet).",
      "ArithFlow will read the header row as column names.",
    ],
    docsUrl: null,
    tip: "If your data starts on row 3, set 'Header Row' to 3. Merged cells are not supported.",
  },

  json: {
    summary: "Upload a JSON or NDJSON file from your computer.",
    steps: [
      "Click the file browser and select your .json file.",
      "ArithFlow supports both a JSON array ([{...}, {...}]) and newline-delimited JSON.",
      "Nested objects will be flattened with dot-notation keys (e.g., 'address.city').",
    ],
    docsUrl: null,
  },

  parquet: {
    summary: "Upload a Parquet file — a highly efficient columnar format.",
    steps: [
      "Click the file browser and select your .parquet file.",
      "No additional configuration is needed — schema is read automatically.",
    ],
    docsUrl: null,
    tip: "Parquet files are often produced by Spark, Pandas, or DuckDB. They load much faster than CSV.",
  },

  // ── Databases ───────────────────────────────────────────────────────
  postgres: {
    summary: "Connect to a PostgreSQL database.",
    steps: [
      "Ask your database administrator (DBA) for the connection details.",
      "You need: Host (e.g. db.example.com), Port (usually 5432), Database name, Username, and Password.",
      "If you're using **Supabase**, go to [Project Settings](https://supabase.com/dashboard/project/_/settings/database) → Database → Connection string and copy the details.",
      "If you're using **Neon**, go to your [Neon Dashboard](https://console.neon.tech/) → Connection Details.",
      "If using a local database, host = 'localhost' and port = '5432'.",
    ],
    docsUrl: "https://www.postgresql.org/docs/current/tutorial-accessdb.html",
    tip: "Make sure ArithFlow's IP address is whitelisted in your database firewall settings.",
  },

  mysql: {
    summary: "Connect to a MySQL or MariaDB database.",
    steps: [
      "Get your Host, Port (usually 3306), Database name, Username, and Password from your hosting panel.",
      "For cPanel hosting: go to Databases → MySQL Databases and create a user with remote access.",
      "For AWS RDS: find the endpoint URL in your RDS console instance details.",
      "Enable remote connections — MySQL blocks external access by default.",
    ],
    docsUrl: "https://dev.mysql.com/doc/refman/8.0/en/connecting.html",
    tip: "Run 'GRANT ALL PRIVILEGES ON dbname.* TO user@\"%\" IDENTIFIED BY \"password\"' to allow remote access.",
  },

  sqlite: {
    summary: "Connect to a SQLite database file.",
    steps: [
      "Upload your .sqlite or .db file, OR provide the absolute file path if the file is on the same server.",
      "SQLite does not require a username or password.",
      "The database is a single file — you can find it in your application's data folder.",
    ],
    docsUrl: null,
    tip: "SQLite is great for smaller datasets. For large production databases, consider PostgreSQL.",
  },

  mongodb: {
    summary: "Connect to a MongoDB database.",
    steps: [
      "For MongoDB Atlas: Go to atlas.mongodb.com → Your Cluster → Connect → Connect your application.",
      "Copy the connection string — it looks like: mongodb+srv://username:password@cluster.mongodb.net/dbname",
      "Replace <password> with your actual password in the connection string.",
      "For a local MongoDB: use mongodb://localhost:27017",
      "Provide the Database name you want to read from.",
    ],
    docsUrl: "https://www.mongodb.com/docs/drivers/node/current/fundamentals/connection/",
    tip: "In Atlas, you must whitelist your IP under Network Access before connecting.",
  },

  snowflake: {
    summary: "Connect to a Snowflake data warehouse.",
    steps: [
      "Log into your [Snowflake account](https://app.snowflake.com/)",
      "Your **Account ID** is in the URL: `https://[account-id].snowflakecomputing.com`.",
      "Go to **Admin → Users & Roles** to find or create your Username.",
      "The Password is the same one you use to log into Snowflake.",
      "The Warehouse, Database, and Schema are visible in the left panel of Snowflake's UI.",
    ],
    docsUrl: "https://docs.snowflake.com/en/user-guide-getting-started",
    tip: "Use a dedicated service user with read-only access for security.",
  },

  sql_server: {
    summary: "Connect to Microsoft SQL Server.",
    steps: [
      "Get the server hostname from your DBA or SQL Server Management Studio (SSMS).",
      "Default port is 1433 — check with your admin if it's different.",
      "You need SQL Server Authentication credentials (not Windows authentication).",
      "The ODBC Driver version depends on what's installed — Driver 17 or 18 are most common.",
      "For Azure SQL: find the server name in the Azure Portal → SQL databases → your database → Overview.",
    ],
    docsUrl: "https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server",
    tip: "You may need to install the Microsoft ODBC Driver from the link above on the server running ArithFlow.",
  },

  oracle: {
    summary: "Connect to an Oracle Database.",
    steps: [
      "Get the Host, Port (usually 1521), and Service Name from your DBA.",
      "The Service Name is different from the SID — ask your DBA which one to use.",
      "Your Username and Password are your Oracle database credentials.",
      "For Oracle Cloud (Autonomous DB): download the Wallet file and use the connection string from the wallet.",
    ],
    docsUrl: "https://python-oracledb.readthedocs.io/en/latest/user_guide/connection_handling.html",
    tip: "Contact your DBA for the exact Service Name — common ones are 'ORCL', 'XEPDB1', or 'FREEPDB1'.",
  },

  redshift: {
    summary: "Connect to Amazon Redshift.",
    steps: [
      "Go to the AWS Console → Amazon Redshift → Clusters → click your cluster.",
      "Find the 'Endpoint' field — copy everything before the colon (:5439). That is your Host.",
      "Port is always 5439 for Redshift.",
      "Your database name, username, and password were set when you created the cluster.",
      "Make sure your cluster's security group allows inbound traffic on port 5439.",
    ],
    docsUrl: "https://docs.aws.amazon.com/redshift/latest/dg/c_redshift-connect.html",
    tip: "If you can't connect, check that the cluster is 'Publicly Accessible' in its configuration.",
  },

  redis: {
    summary: "Connect to a Redis instance.",
    steps: [
      "Get the Host and Port from your Redis provider (default port: 6379).",
      "For Redis Cloud: go to redis.com/cloud → your database → Configuration to find the endpoint.",
      "For Upstash: go to your database dashboard and copy the Endpoint and Password.",
      "Password is only needed if your Redis is password-protected.",
      "Database Index is 0 by default in most setups.",
    ],
    docsUrl: "https://redis.io/docs/latest/operate/rs/databases/connect/",
    tip: "For a local Redis, just use host=localhost and leave Password empty.",
  },

  // ── Cloud Storage ───────────────────────────────────────────────────
  s3: {
    summary: "Connect to an Amazon S3 bucket.",
    steps: [
      "Go to the AWS Console → IAM → Users → Create a new user with S3 read access.",
      "After creating the user, go to Security Credentials → Create Access Key.",
      "Copy the Access Key ID and Secret Access Key — you won't be able to see the secret again.",
      "Your Bucket Name is visible in S3 → Buckets list.",
      "Region is shown next to the bucket name (e.g., us-east-1).",
    ],
    docsUrl: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-bucket-intro.html",
    tip: "Never use your root AWS account keys. Always create a dedicated IAM user with minimum permissions.",
  },

  // ── CRM / Support ───────────────────────────────────────────────────
  hubspot: {
    summary: "Connect to your HubSpot CRM via Private App.",
    steps: [
      "Log into your **HubSpot account**.",
      "Go to **Settings** (gear icon) → **Integrations** → [Private Apps](https://app.hubspot.com/settings/api-key).",
      "Click **'Create a private app'**, give it a name like 'ArithFlow'.",
      "Under **Scopes**, add `crm.objects.contacts.read`, `crm.objects.deals.read`, etc.",
      "Click **'Create app'** and copy the **Access Token** shown.",
    ],
    docsUrl: "https://developers.hubspot.com/docs/api/private-apps",
    tip: "Private Apps are more secure than API keys. The token starts with `pat-na1-...`.",
  },

  salesforce: {
    summary: "Connect to Salesforce CRM using Connected Apps.",
    steps: [
      "In Salesforce, go to **Setup → Apps → App Manager → New Connected App**.",
      "Enable **OAuth settings**, set callback URL to `https://localhost`.",
      "Select required **OAuth scopes** (Full access or specific ones).",
      "Save and note the **Consumer Key** (client_id) and **Consumer Secret** (client_secret).",
      "Your Username and Password are your Salesforce login credentials.",
      "**Security Token**: Go to your [Profile Settings](https://help.salesforce.com/s/articleView?id=sf.user_security_token.htm) → **Reset My Security Token**.",
    ],
    docsUrl: "https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm",
    tip: "Append the Security Token to your password if connecting from an untrusted IP.",
  },

  zendesk: {
    summary: "Connect to Zendesk Support.",
    steps: [
      "Log into Zendesk and go to Admin Center (gear icon).",
      "Go to Apps and Integrations → Zendesk API.",
      "Enable Password Access or click 'Add API token'.",
      "Copy the API token shown.",
      "Your subdomain is the part before .zendesk.com in your URL (e.g., 'mycompany').",
    ],
    docsUrl: "https://developer.zendesk.com/api-reference/introduction/security-and-auth/",
    tip: "Use email/token authentication: email is your Zendesk login email, token is the API token you created.",
  },

  intercom: {
    summary: "Connect to Intercom.",
    steps: [
      "Log into Intercom and go to Settings → Integrations → Developer Hub.",
      "Create a new app or click an existing one.",
      "Go to Authentication → Access Token.",
      "Copy the Access Token shown.",
    ],
    docsUrl: "https://developers.intercom.com/docs/build-an-integration/getting-started/",
    tip: "The Access Token for internal apps starts with 'dG9r...'.",
  },

  pipedrive: {
    summary: "Connect to Pipedrive CRM.",
    steps: [
      "Log into Pipedrive and go to your Avatar (top right) → Personal Preferences.",
      "Click the 'API' tab.",
      "Copy the Personal API Token shown on that page.",
    ],
    docsUrl: "https://pipedrive.readme.io/docs/how-to-find-the-api-token",
    tip: "This token gives full access to your Pipedrive data. Keep it secret.",
  },

  zoho: {
    summary: "Connect to Zoho CRM.",
    steps: [
      "Go to api-console.zoho.com and log in.",
      "Click 'Self Client' to generate a token.",
      "Under Scope, enter: ZohoCRM.modules.ALL,ZohoCRM.settings.ALL",
      "Set Time Duration to 10 minutes, click Generate Code.",
      "Exchange the code for an Access Token using the Zoho OAuth2 token endpoint.",
    ],
    docsUrl: "https://www.zoho.com/crm/developer/docs/api/v6/oauth-overview.html",
    tip: "Zoho tokens expire. For ongoing access, you'll need to implement token refresh or use a service account.",
  },

  // ── E-Commerce ──────────────────────────────────────────────────────
  shopify: {
    summary: "Connect to your Shopify store.",
    steps: [
      "Log into your Shopify admin panel.",
      "Go to Settings → Apps and sales channels → Develop apps.",
      "Click 'Create an app', give it a name like 'ArithFlow'.",
      "Click 'Configure Admin API scopes', enable the data you need (Orders, Products, Customers).",
      "Click 'Install app', then copy the 'Admin API access token'.",
      "Your Store URL is your shop domain, e.g., 'mystore.myshopify.com'.",
    ],
    docsUrl: "https://help.shopify.com/en/manual/apps/app-types/custom-apps",
    tip: "The access token is only shown once after installation — save it immediately!",
  },

  stripe: {
    summary: "Connect to your Stripe account.",
    steps: [
      "Log into dashboard.stripe.com",
      "Click 'Developers' in the top menu.",
      "Go to API keys → click 'Reveal live key' next to the Secret key.",
      "Copy the key (starts with 'sk_live_...').",
      "For testing, use the Test mode secret key (starts with 'sk_test_...').",
    ],
    docsUrl: "https://stripe.com/docs/keys",
    tip: "Use a Restricted Key with only the permissions ArithFlow needs (read-only on relevant resources).",
  },

  // ── Marketing / Email ───────────────────────────────────────────────
  mailchimp: {
    summary: "Connect to Mailchimp.",
    steps: [
      "Log into your Mailchimp account.",
      "Click your profile avatar → Account & billing → Extras → API keys.",
      "Click 'Create A Key', give it a name.",
      "Copy the API key — it ends with your datacenter (e.g., '-us1').",
      "The datacenter is embedded in the key itself.",
    ],
    docsUrl: "https://mailchimp.com/developer/marketing/guides/quick-start/",
    tip: "The datacenter suffix (us1, us2, etc.) at the end of the key tells ArithFlow which server to use.",
  },

  sendgrid: {
    summary: "Connect to SendGrid.",
    steps: [
      "Log into app.sendgrid.com",
      "Go to Settings → API Keys → Create API Key.",
      "Name it 'ArithFlow', set permission level to 'Full Access' or select specific scopes.",
      "Click Create & View, copy the key shown (starts with 'SG.').",
    ],
    docsUrl: "https://docs.sendgrid.com/ui/account-and-settings/api-keys",
    tip: "The key is only shown once — copy it before closing the page!",
  },

  marketo: {
    summary: "Connect to Marketo.",
    steps: [
      "Log into Marketo and go to Admin → Web Services.",
      "Find your Munchkin ID — it looks like '123-ABC-456'.",
      "Go to Admin → LaunchPoint → New Service → select 'Custom'.",
      "Give it a name, then after creation click 'View Details'.",
      "Copy the Client ID and Client Secret shown.",
    ],
    docsUrl: "https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/authentication",
    tip: "The Munchkin ID is unique to your Marketo instance and is used in all API calls.",
  },

  // ── Communication ───────────────────────────────────────────────────
  twilio: {
    summary: "Connect to Twilio.",
    steps: [
      "Log into console.twilio.com",
      "On the main dashboard, you'll see your 'Account SID' and 'Auth Token' directly.",
      "Click the 'Copy' icon next to each value.",
      "The Account SID starts with 'AC...'.",
    ],
    docsUrl: "https://www.twilio.com/docs/iam/token-authentication",
    tip: "Never share your Auth Token. If compromised, regenerate it immediately from the console.",
  },

  discord: {
    summary: "Connect to Discord (Bot API).",
    steps: [
      "Go to discord.com/developers/applications and log in.",
      "Click 'New Application', give it a name.",
      "Go to the 'Bot' section and click 'Add Bot'.",
      "Click 'Reset Token' and copy the Bot Token shown.",
      "To read messages from servers, the bot must be invited to the server first.",
    ],
    docsUrl: "https://discord.com/developers/docs/intro",
    tip: "Bot tokens start with a long string. The token is sensitive — regenerate if exposed.",
  },

  slack: {
    summary: "Connect to Slack.",
    steps: [
      "Go to api.slack.com/apps and click 'Create New App'.",
      "Choose 'From scratch', name it 'ArithFlow', select your workspace.",
      "Go to 'OAuth & Permissions' → add required scopes (channels:read, messages:read, etc.).",
      "Click 'Install to Workspace' and authorize.",
      "Copy the 'Bot User OAuth Token' (starts with 'xoxb-...').",
    ],
    docsUrl: "https://api.slack.com/authentication/token-types",
    tip: "Your bot needs to be added to each channel you want to read data from.",
  },

  zoom: {
    summary: "Connect to Zoom.",
    steps: [
      "Go to marketplace.zoom.us and log in.",
      "Click 'Develop' → 'Build App' → choose 'Server-to-Server OAuth'.",
      "Give your app a name, fill in company info, then click 'Continue'.",
      "Copy the Account ID, Client ID, and Client Secret from the credentials tab.",
      "Add required scopes under 'Scopes' (e.g., meeting:read, report:read).",
    ],
    docsUrl: "https://developers.zoom.us/docs/internal-apps/",
    tip: "Server-to-Server OAuth is the recommended approach for data extraction (no user login needed).",
  },

  // ── Analytics / BI ──────────────────────────────────────────────────
  mixpanel: {
    summary: "Connect to Mixpanel.",
    steps: [
      "Log into mixpanel.com → go to your Project Settings.",
      "Click 'Service Accounts' in the left menu.",
      "Click 'Add Service Account', give it a name.",
      "Copy the Username and Secret shown — these are your credentials.",
    ],
    docsUrl: "https://developer.mixpanel.com/reference/service-accounts",
    tip: "Service accounts are scoped — make sure to add 'Analyst' or higher role for data export.",
  },

  amplitude: {
    summary: "Connect to Amplitude.",
    steps: [
      "Log into amplitude.com and open your project.",
      "Go to Settings → Projects → click your project name.",
      "Under 'General', find the 'API Key' and 'Secret Key'.",
      "Copy both values.",
    ],
    docsUrl: "https://www.docs.developers.amplitude.com/analytics/apis/export-api/",
    tip: "The API Key and Secret Key are specific to each Amplitude project.",
  },

  // ── Finance / Payments ──────────────────────────────────────────────
  paypal: {
    summary: "Connect to PayPal.",
    steps: [
      "Log into developer.paypal.com",
      "Go to Apps & Credentials.",
      "Click 'Create App', name it 'ArithFlow', select 'Merchant' type.",
      "After creation, copy the Client ID and Secret.",
      "Use 'Sandbox' mode for testing, 'Live' for production data.",
    ],
    docsUrl: "https://developer.paypal.com/api/rest/",
    tip: "Switch to 'Live' in the top toggle on the PayPal developer dashboard to get live credentials.",
  },

  xero: {
    summary: "Connect to Xero.",
    steps: [
      "Go to developer.xero.com/app/manage and log in.",
      "Click 'New app', fill in your app details.",
      "Set the redirect URI to https://localhost/callback (for setup purposes).",
      "After creation, go to the app's 'Configuration' tab.",
      "Copy the Client ID and generate a Client Secret by clicking 'Generate a secret'.",
    ],
    docsUrl: "https://developer.xero.com/documentation/getting-started-guide/",
    tip: "Each Xero organization has a Tenant ID. You'll need to grant your app access to a specific organization.",
  },

  // ── HR / ERP ────────────────────────────────────────────────────────
  workday: {
    summary: "Connect to Workday.",
    steps: [
      "Your Workday Tenant ID is the subdomain of your Workday login URL (e.g., mycompany in mycompany.workday.com).",
      "Ask your Workday administrator to create an API Client in Workday: Workday → API Clients → Create API Client.",
      "Set the 'Client Grant Type' to 'Client Credentials'.",
      "Copy the Client ID and Client Secret generated.",
      "The Token URL is auto-generated based on your tenant — your admin can provide it.",
    ],
    docsUrl: "https://doc.workday.com/admin-guide/en-us/workday-studio/integration-design/en-us_int_dg_rest_api.html",
    tip: "Workday requires your IT/admin team to enable API access. Contact your Workday system admin first.",
  },

  // ── Developer Tools ─────────────────────────────────────────────────
  github: {
    summary: "Connect to GitHub.",
    steps: [
      "Log into github.com and click your profile avatar → Settings.",
      "Go to 'Developer settings' (bottom of the left menu) → Personal access tokens → Tokens (classic).",
      "Click 'Generate new token (classic)'.",
      "Select the scopes you need: 'repo' for repository data, 'read:user' for user info.",
      "Copy the generated token — it won't be shown again!",
    ],
    docsUrl: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token",
    tip: "Use a fine-grained access token for better security — it limits access to specific repositories.",
  },

  gitlab: {
    summary: "Connect to GitLab.",
    steps: [
      "Log into gitlab.com (or your self-managed instance).",
      "Click your Avatar → Edit Profile → Access Tokens.",
      "Click 'Add new token', give it a name, set an expiry.",
      "Select required scopes: 'read_api', 'read_repository'.",
      "Click 'Create personal access token' and copy the token shown.",
      "For self-hosted GitLab, enter your instance URL (e.g., https://gitlab.mycompany.com).",
    ],
    docsUrl: "https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html",
    tip: "Personal access tokens are scoped — only enable the permissions ArithFlow actually needs.",
  },

  bitbucket: {
    summary: "Connect to Bitbucket.",
    steps: [
      "Log into bitbucket.org and click your Avatar → Personal Settings.",
      "Go to 'App passwords' → Create app password.",
      "Give it a label like 'ArithFlow', and select required permissions (Repositories: Read).",
      "Click 'Create' and copy the app password shown.",
      "Your Username is your Bitbucket account username (not email).",
    ],
    docsUrl: "https://support.atlassian.com/bitbucket-cloud/docs/create-an-app-password/",
    tip: "App passwords are safer than your main account password — they can be revoked anytime.",
  },

  // ── Monitoring / DevOps ──────────────────────────────────────────────
  datadog: {
    summary: "Connect to Datadog.",
    steps: [
      "Log into app.datadoghq.com",
      "Go to Organization Settings → API Keys → New Key.",
      "Give it a name 'ArithFlow' and copy the Key.",
      "Then go to Application Keys → New Key, give it a name, and copy it.",
      "Both keys (API Key and App Key) are needed.",
    ],
    docsUrl: "https://docs.datadoghq.com/account_management/api-app-keys/",
    tip: "The API Key identifies your organization. The Application Key identifies the specific integration.",
  },

  // ── Google Services ──────────────────────────────────────────────────
  google_sheets: {
    summary: "Connect to Google Sheets directly via API.",
    steps: [
      "Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project.",
      "Enable the [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com).",
      "Go to [Credentials](https://console.cloud.google.com/apis/credentials), create a **Service Account**, and download its JSON key.",
      "Paste the **entire JSON file content** into the credentials field in ArithFlow.",
      "**CRITICAL**: Share your Google Sheet with the Service Account's email (found in your JSON file) to grant access.",
    ],
    docsUrl: "https://developers.google.com/sheets/api/guides/concepts",
    tip: "If you get a 403 Forbidden error, double-check that you've 'shared' the sheet with the service account email.",
  },

  google_analytics: {
    summary: "Connect to Google Analytics 4.",
    steps: [
      "Go to console.cloud.google.com → APIs → Enable 'Google Analytics Data API'.",
      "Create a Service Account and download the JSON key file (see Google Sheets guide above for steps).",
      "In Google Analytics → Admin → Property → Property Access Management → add the service account email as 'Viewer'.",
      "Find your GA4 Property ID in Admin → Property Settings (e.g., 123456789).",
    ],
    docsUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1",
    tip: "The Property ID is a number, not the 'G-XXXXXXXX' tracking ID.",
  },

  google_ads: {
    summary: "Connect to Google Ads.",
    steps: [
      "In Google Ads, go to Tools & Settings → API Center → Apply for access.",
      "Create a Service Account in Google Cloud Console and enable the Google Ads API.",
      "Your Customer ID is the 10-digit number shown at the top right of Google Ads (e.g., 123-456-7890).",
      "Your Developer Token is in Tools → API Center (may need approval).",
    ],
    docsUrl: "https://developers.google.com/google-ads/api/docs/start",
    tip: "Google Ads API requires a Developer Token that must be approved by Google — this can take a few days.",
  },

  google_drive: {
    summary: "Connect to Google Drive.",
    steps: [
      "Create a Service Account in Google Cloud Console (see Google Sheets guide for details).",
      "Enable the 'Google Drive API' in APIs & Services.",
      "Download the JSON key and paste it in the credentials field.",
      "Share the specific Drive folder with the service account email to grant access.",
    ],
    docsUrl: "https://developers.google.com/drive/api/guides/about-sdk",
    tip: "You only need to share the specific folder, not your entire Drive.",
  },

  google_search_console: {
    summary: "Connect to Google Search Console.",
    steps: [
      "Create a Service Account in Google Cloud Console.",
      "Enable the 'Google Search Console API'.",
      "In Google Search Console → Settings → Users and permissions → Add user — add the service account email as 'Full'.",
      "Download the JSON credentials and paste them in the field provided.",
    ],
    docsUrl: "https://developers.google.com/webmaster-tools/v1/how-tos/authorizing",
    tip: "The service account must be verified as a site owner or at least have full user permission.",
  },

  // ── Social / Ads ─────────────────────────────────────────────────────
  facebook_ads: {
    summary: "Connect to Facebook / Meta Ads.",
    steps: [
      "Go to developers.facebook.com and create an app.",
      "Add the 'Marketing API' product to your app.",
      "Go to Tools → Graph API Explorer, select your app, generate a User Access Token.",
      "Under permissions, add 'ads_read' and 'ads_management'.",
      "Your Ad Account ID is in Meta Ads Manager — it starts with 'act_' followed by numbers.",
    ],
    docsUrl: "https://developers.facebook.com/docs/marketing-api/get-started",
    tip: "User tokens expire. For production, use a System User token from Business Settings.",
  },

  linkedin_ads: {
    summary: "Connect to LinkedIn Ads.",
    steps: [
      "Go to linkedin.com/developers/apps and create a new app.",
      "Select your company page, fill in the details.",
      "Go to Auth → OAuth 2.0 settings, add a redirect URL.",
      "Request the scopes: r_ads, r_ads_reporting.",
      "Generate an access token using the OAuth flow.",
      "Your Ad Account ID is visible in LinkedIn Campaign Manager.",
    ],
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/",
    tip: "LinkedIn OAuth tokens expire after 60 days unless you use a long-lived token.",
  },

  // ── Productivity ─────────────────────────────────────────────────────
  notion: {
    summary: "Connect to Notion.",
    steps: [
      "Go to notion.so/my-integrations and click '+ New Integration'.",
      "Give it a name like 'ArithFlow', select your workspace.",
      "Click 'Submit'. Copy the 'Internal Integration Secret' shown.",
      "In the Notion pages you want to access: click '...' → Connections → Add your integration.",
    ],
    docsUrl: "https://developers.notion.com/docs/getting-started",
    tip: "IMPORTANT: You must share each Notion page with your integration — it won't auto-discover all pages.",
  },

  airtable: {
    summary: "Connect to Airtable.",
    steps: [
      "Go to airtable.com/create/tokens and click 'Create new token'.",
      "Give it a name, set scope to 'data.records:read', select the bases you want to access.",
      "Click 'Create token' and copy the token shown.",
      "Your Base ID is in the URL when you open a base: airtable.com/[BaseID]/...",
    ],
    docsUrl: "https://airtable.com/developers/web/api/introduction",
    tip: "Personal access tokens can be scoped to specific bases. Use fine-grained access for security.",
  },

  // ── Project Management ───────────────────────────────────────────────
  jira: {
    summary: "Connect to Jira (Atlassian Cloud).",
    steps: [
      "Log into your Atlassian account at atlassian.com",
      "Go to account.atlassian.com/manage-profile/security/api-tokens",
      "Click 'Create API token', give it a label like 'ArithFlow'.",
      "Copy the token shown — you won't see it again.",
      "Your domain is the part before .atlassian.net in your Jira URL (e.g., 'mycompany' in mycompany.atlassian.net).",
      "Your email is the email you use to log into Jira.",
    ],
    docsUrl: "https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/",
    tip: "Enter the FULL domain including .atlassian.net in the domain field (e.g., mycompany.atlassian.net).",
  },

  asana: {
    summary: "Connect to Asana.",
    steps: [
      "Log into app.asana.com",
      "Click your profile photo → My Settings → Apps → Manage Developer Apps.",
      "Click 'New access token', give it a name.",
      "Copy the Personal Access Token shown.",
    ],
    docsUrl: "https://developers.asana.com/docs/authentication",
    tip: "PATs are tied to your user account. For team access, consider using a dedicated service account.",
  },

  trello: {
    summary: "Connect to Trello.",
    steps: [
      "Go to trello.com/app-key and log in — you'll see your API Key at the top.",
      "Copy the API Key.",
      "Click 'Token' link on the same page to generate a Token.",
      "Authorize the token when prompted and copy it.",
    ],
    docsUrl: "https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/",
    tip: "The Token grants access to boards in your account. Keep it secret.",
  },

  // ── Generic SQL (SQLAlchemy) ─────────────────────────────────────────
  jdbc: {
    summary: "Connect to any database using a SQLAlchemy connection string.",
    steps: [
      "Get the connection details from your database administrator.",
      "Construct a SQLAlchemy-compatible connection URL.",
      "Format: dialect+driver://username:password@host:port/database",
      "Example: postgresql+psycopg2://user:pass@localhost/dbname",
      "Specify which tables you want to import (comma-separated).",
    ],
    docsUrl: "https://docs.sqlalchemy.org/en/20/core/engines.html#database-urls",
    tip: "This uses Python SQLAlchemy, NOT raw Java JDBC URLs. Ensure your URL matches SQLAlchemy syntax.",
  },

  odbc: {
    summary: "Connect any database using an ODBC connection string via SQLAlchemy.",
    steps: [
      "Construct a SQLAlchemy-compatible connection URL for ODBC.",
      "Example: mssql+pyodbc://username:password@dsn_name",
      "Specify which tables to import (comma-separated).",
    ],
    docsUrl: "https://docs.sqlalchemy.org/en/20/dialects/mssql.html#module-sqlalchemy.dialects.mssql.pyodbc",
    tip: "Make sure the correct ODBC driver and python package (e.g. pyodbc) are installed on the server.",
  },

  // ── Universal ────────────────────────────────────────────────────────
  dlt: {
    summary: "Universal connector for 500+ APIs and Singer taps.",
    steps: [
      "Select the API you want to connect from the dropdown list, OR select 'Custom' to type any tap name.",
      "Find the credentials required by the specific tap/API you're using.",
      "Usually you need at least an API key or token — check the tap's documentation.",
      "Paste all required credentials as a JSON object in the 'Configuration Data' field.",
      "Example: {\"api_key\": \"my-secret-key\", \"base_url\": \"https://api.example.com\"}",
    ],
    docsUrl: "https://www.singer.io/#taps",
    tip: "Each Singer tap has its own documentation. Search for 'tap-[service-name]' on GitHub to find the config schema.",
  },

  // ── General fallback ─────────────────────────────────────────────────
  rest_api: {
    summary: "Connect to any REST API endpoint.",
    steps: [
      "Enter the Base URL of the API (e.g., https://api.example.com/v2).",
      "Add your API Key in the Headers section if required.",
      "Specify the endpoint path (e.g., /users or /reports).",
      "Review the API documentation of the service you're connecting to.",
    ],
    docsUrl: null,
    tip: "Most modern APIs use a Bearer token for authentication: add 'Authorization: Bearer YOUR_TOKEN' as a header.",
  },

  d365: {
    summary: "Connect to Microsoft Dynamics 365.",
    steps: [
      "In Azure Portal, register a new application under Azure Active Directory → App registrations.",
      "Note the Application (client) ID and Directory (tenant) ID.",
      "Under Certificates & secrets, create a new client secret and copy it.",
      "In Dynamics 365, go to Settings → Security → Users → create an Application User and link to your app registration.",
      "Assign the appropriate security role to the Application User.",
    ],
    docsUrl: "https://docs.microsoft.com/en-us/power-apps/developer/data-platform/authenticate-oauth",
    tip: "This requires admin access to both Azure and Dynamics 365. Contact your IT team.",
  },

  tally: {
    summary: "Connect to TallyPrime.",
    steps: [
      "Open TallyPrime → Press F12 → Advanced Configuration → Enable ODBC Server.",
      "Note the port (default: 9000).",
      "Use host=localhost and port=9000 if TallyPrime is on the same machine.",
      "No username/password is required for the default ODBC connection.",
    ],
    docsUrl: "https://help.tallysolutions.com/tally-prime/",
    tip: "TallyPrime must be running with the company open for data to be accessible.",
  },
};

/**
 * Returns the guide for a given engine, or a generic fallback.
 */
export function getGuide(engine) {
  return CONNECTOR_GUIDES[engine] || {
    summary: "Connect to this service using your credentials.",
    steps: [
      "Check the official documentation for this service to find your API credentials.",
      "Typically you'll need an API Key, Token, or Username/Password combination.",
      "Enter these credentials in the form fields below.",
    ],
    docsUrl: null,
    tip: "Look for 'API Keys', 'Tokens', or 'Developer Settings' in your account settings.",
  };
}
