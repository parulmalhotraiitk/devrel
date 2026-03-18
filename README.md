# Omnichannel DevRel Empire

An AI-powered automation system that turns Notion into an autonomous publishing command center. Write once in Notion, and instantly publish beautifully formatted content, AI-generated images, and social drafts across DEV.to, Hashnode, Twitter, and LinkedIn.

## 🚀 Features
- **Notion as a Backend**: Reads your content database and executes commands based on your Notion page properties.
- **AI Auto-Expansion & Imagery**: Uses **Google Gemini 2.5 Flash** to automatically expand short notes into comprehensive Markdown articles, and **Imagen 3** to generate custom cover images hosted on Google Cloud Storage.
- **Multi-Platform Publishing**: Automatically publishes your Markdown to DEV.to and Hashnode via their APIs.
- **SaaS Dashboard**: A premium, glassmorphism-style React frontend to securely manage your API keys.
- **Serverless Ready**: Fully containerized and configured for deployment on Google Cloud Run with Scheduler logic.

## 📋 Prerequisites
To run this project, you will need the following API keys and tokens:
1. **Notion API Token** (`NOTION_API_TOKEN`) - An internal integration token.
2. **Notion Database ID** (`NOTION_DATABASE_ID`) - The ID of your content database.
3. **Google Gemini API Key** (`GEMINI_API_KEY`)
4. **DEV.to API Key** (`DEV_API_KEY`)
5. **Hashnode API Key** (`HASHNODE_API_KEY`)

## 🛠️ Local Setup
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file in the root directory and add your keys (see `.env.example`).
3. Build and run the development server:
   ```bash
   npm run build
   npm run dev
   ```
4. Trigger the workflow locally via an HTTP POST request:
   ```bash
   curl -X POST http://localhost:8080/execute
   ```

## ☁️ Google Cloud Run Deployment
This project is configured to run effortlessly on Google Cloud Run as a scheduled job or webhook receiver.

1. Ensure you have the `gcloud` CLI installed and authenticated.
2. Build and submit your container image:
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/devrel-empire
   ```
3. Deploy to Cloud Run:
   ```bash
   gcloud run deploy devrel-empire \
     --image gcr.io/YOUR_PROJECT_ID/devrel-empire \
     --platform managed
   ```
   > [!TIP]
   > For production "Empire" scale, do not pass env vars via CLI. Instead, use **Google Cloud Secret Manager** to store your keys and mount them as environment variables in Cloud Run for maximum security.

4. Set up **Google Cloud Scheduler** to ping your Cloud Run `/execute` endpoint URL every 30 minutes.

## 📚 Notion Database Setup
Your Notion database must have at least the following properties:
*   `Title` (Title): The title of the post.
*   `Status` (Status or Select): Options must include `"Ready to Publish"` and `"Published"`.
*   `Platforms` (Multi-select): Options should exactly match `"DEV.to"`, `"Hashnode"`, `"Twitter"`, `"LinkedIn"`.

## Architecture Details
This backend operates as a scalable cloud-native cron service. Because Cloud Run environments are stateless, the Node.js application boots up when triggered by Cloud Scheduler, dynamically interacts with your Notion Workspace, executes the necessary Gemini generation tasks or publishing API calls, and then spins down. Keys inputted via the frontend dashboard are sent straight to secure backend storage, keeping the frontend fully decoupled from secret management.
