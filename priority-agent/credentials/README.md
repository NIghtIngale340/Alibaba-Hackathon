# Gmail API Credentials Setup

To use the priority agent with Gmail, you need to set up Google Cloud credentials.

## Steps:

1. **Go to Google Cloud Console**: https://console.cloud.google.com/

2. **Create a New Project** (or select existing):
   - Click "Select a project" → "New Project"
   - Name it (e.g., "Email Priority Agent")
   - Click "Create"

3. **Enable Gmail API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Gmail API"
   - Click "Enable"

4. **Create OAuth 2.0 Credentials**:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Configure consent screen if prompted:
     * User Type: External
     * App name: "Email Priority Agent"
     * Add your email as test user
   - Application type: "Desktop app"
   - Name: "Priority Agent Desktop"
   - Click "Create"

5. **Download Credentials**:
   - Click the download icon next to your OAuth client
   - Save the file as `credentials.json`
   - **PLACE IT IN THIS FOLDER** (`priority-agent/credentials/credentials.json`)

6. **First Run Authentication**:
   - When you first run the agent, a browser window will open
   - Sign in with your Gmail account
   - Grant permissions (you may need to click "Advanced" → "Go to app (unsafe)")
   - The token will be saved automatically in `tokens/token.pickle`

## Required Scopes:
- `https://www.googleapis.com/auth/gmail.modify` (to read and mark emails)

## Security Note:
- Never commit `credentials.json` or `token.pickle` to version control
- These files contain sensitive authentication data
