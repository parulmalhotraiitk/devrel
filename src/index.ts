import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { processNotionReadyPages } from './mcp/notion-client.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// Health check / status page
app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({ status: "online", service: "devrel-empire-worker" });
});

// Endpoint triggered by Google Cloud Scheduler
app.post('/execute', async (req: Request, res: Response) => {
    try {
        console.log('Starting DevRel Empire workflow execution...');
        await processNotionReadyPages();
        console.log('Workflow execution completed successfully.');
        res.status(200).send('Workflow execution completed successfully.');
    } catch (error: any) {
        console.error('Error executing workflow:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`DevRel Empire service listening on port ${port}`);
});
