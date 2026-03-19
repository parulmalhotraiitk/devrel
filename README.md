# 🚀 Omnichannel DevRel Empire
**Autonomous Content Publishing & Imagery Command Center built for the Notion MCP Challenge.**

DevRel Empire turns Notion into a headless, autonomous publishing engine. By leveraging the **official Notion MCP Server**, it transforms simple bullet points into comprehensive multi-platform articles with AI-generated cover images, social drafts (Twitter/LinkedIn), and zero-click distribution.

## 🧩 Notion MCP Challenge (Official Integration)
This project is built to demonstrate the power of the **Model Context Protocol** (MCP) in a cloud-native, serverless environment.

- **Native Tool Usage**: Interacts with Notion using `API-post-search` for intelligent page discovery, `API-patch-page` for status-driven state management, and `API-create-a-comment` for cross-platform link reporting.
- **Zero-Trust Auth**: Runs the `@notionhq/notion-mcp-server` package natively inside a Google Cloud Run container, dynamically injecting credentials per-request over a secure Stdio transport.
- **Protocol Depth**: Implements a hybrid architecture using full JSON-RPC 2.0 to the MCP server for logic, and the standard REST SDK for granular multi-block structural updates (like appending AI drafts).

## 🚀 Key Features
- **Two-Stage Autonomous Workflow**:
  - **Phase 1 (Drafting)**: Set status to `Generate AI Content`. Gemini 2.5 expands your notes and Imagen 3 generates a custom cover image hosted on **Google Cloud Storage (GCS)**. Results appear directly in your Notion page.
  - **Phase 2 (Publishing)**: Review the draft and flip status to `Publish Now`. The system instantly distributes your content to **DEV.to** and **Hashnode**, and leaves a comment with the live links.
- **AI-Powered Imagery**: Fully automated cover image generation using **Imagen 3**, with high-performance hosting on GCS.
- **SaaS Management Dashboard**: A premium, glassmorphism-style React dashboard (Vite/TypeScript) to securely manage your API keys and monitor the "Empire" status.

## 🛠️ Tech Stack
- **Notion MCP**: Native protocol integration for discovery and state orchestration.
- **Google Gemini 2.5 Flash**: Text expansion and social media drafting.
- **Imagen 3**: High-fidelity AI cover image generation.
- **Google Cloud Run**: Serverless compute for the backend "Command Center".
- **Google Cloud Scheduler**: Automated polling (1-min intervals).
- **Vite & TypeScript**: Premium management UI.

## 📋 Prerequisites
You will need:
1. **Notion API Token** (`NOTION_API_TOKEN`)
2. **Notion Database ID** (`NOTION_DATABASE_ID`)
3. **Google Gemini / Vertex AI Key** (`GEMINI_API_KEY`)
4. **DEV.to/Hashnode API Keys** (`DEV_API_KEY`, `HASHNODE_API_KEY`)
5. **Google Cloud Storage Bucket** (`GCS_BUCKET_NAME`)

## 🛠️ Setup & Deployment
1. **Install Dependencies**: `npm install`
2. **Notion Template**: Duplicate our [Official Notion Template](https://www.notion.so/MyTemplate-327be71560b58093b711eeb16ad4e5d3) to get the necessary properties (`Status`, `Platforms`, `Title`).
3. **Dashboard Access**: Access the live SaaS dashboard to input your keys:
   `https://devrel-empire-788395886100.us-central1.run.app`
4. **Autonomous Polling**: Ensure Google Cloud Scheduler is configured to hit the `/execute` endpoint URL of your Cloud Run service.

## ⚖️ License
MIT License. Built with passion for the Notion MCP Hackathon.
