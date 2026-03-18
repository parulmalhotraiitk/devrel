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

// Serve static frontend files (built from the frontend directory into dist/frontend)
// Note: We'll serve from dist/frontend which matches our vite build output
app.use(express.static(path.join(__dirname, 'frontend')));

// Health check / status page (kept but frontend is now default at '/')
app.get('/status', (_req: Request, res: Response) => {
    res.status(200).json({ status: "online", version: "1.2.0" });
});

// Mock database for settings (in production this would be Firestore/SQL)
let userSettings = {
    notionToken: process.env.NOTION_API_TOKEN || "",
    notionDb: process.env.NOTION_DATABASE_ID || "",
    geminiKey: process.env.GEMINI_API_KEY || "",
    devKey: process.env.DEV_API_KEY || "",
    gcsBucket: process.env.GCS_BUCKET_NAME || "devrel-empire-images",
    hashnodeKey: process.env.HASHNODE_API_KEY || "",
    hashnodePubId: process.env.HASHNODE_PUBLICATION_ID || "",
    mediumKey: process.env.MEDIUM_API_KEY || "",
    
    // Master Switches
    enableDev: process.env.ENABLE_DEV !== 'false',
    enableHashnode: process.env.ENABLE_HASHNODE !== 'false',
    enableMedium: process.env.ENABLE_MEDIUM !== 'false'
};

// API: Save Settings — keys are NEVER returned to the client
app.post('/api/settings', async (req: Request, res: Response) => {
    try {
        const body = req.body as Record<string, string | boolean>;
        const keyMap: Record<string, string> = {
            notionToken: 'NOTION_API_TOKEN',
            notionDb: 'NOTION_DATABASE_ID',
            geminiKey: 'GEMINI_API_KEY',
            devKey: 'DEV_API_KEY',
            gcsBucket: 'GCS_BUCKET_NAME',
            hashnodeKey: 'HASHNODE_API_KEY',
            hashnodePubId: 'HASHNODE_PUBLICATION_ID',
            mediumKey: 'MEDIUM_API_KEY'
        };
        
        const boolMap: Record<string, string> = {
            enableDev: 'ENABLE_DEV',
            enableHashnode: 'ENABLE_HASHNODE',
            enableMedium: 'ENABLE_MEDIUM'
        };

        const updatedKeys: string[] = [];
        // Handle strings
        for (const [field, envVar] of Object.entries(keyMap)) {
            if (body[field] && typeof body[field] === 'string' && (body[field] as string).trim()) {
                const val = (body[field] as string).trim();
                process.env[envVar] = val;
                (userSettings as any)[field] = val;
                updatedKeys.push(field); 
            }
        }
        
        // Handle booleans
        for (const [field, envVar] of Object.entries(boolMap)) {
            if (body[field] !== undefined) {
                const val = String(body[field]);
                process.env[envVar] = val;
                (userSettings as any)[field] = val === 'true';
                updatedKeys.push(field); 
            }
        }

        // Security: never log actual key values
        console.log(`User settings updated via UI. Fields updated: [${updatedKeys.join(', ')}]`);
        res.status(200).json({ message: 'Settings saved successfully', updated: updatedKeys });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// API: Get Settings — ONLY returns boolean switch states, never key values
app.get('/api/settings', (_req: Request, res: Response) => {
    res.status(200).json({
        enableDev: (userSettings as any).enableDev ?? true,
        enableHashnode: (userSettings as any).enableHashnode ?? true,
        enableMedium: (userSettings as any).enableMedium ?? true,
        // Indicate which keys are set (boolean only, never the value)
        hasDevKey: !!process.env.DEV_API_KEY,
        hasHashnodeKey: !!process.env.HASHNODE_API_KEY,
        hasMediumKey: !!process.env.MEDIUM_API_KEY,
        hasNotionToken: !!process.env.NOTION_API_TOKEN,
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
    });
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

// Fallback to index.html for SPA (Express v5 requires named wildcard)
app.get('*splat', (_req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.listen(port, () => {
    console.log(`DevRel Empire service listening on port ${port}`);
});
