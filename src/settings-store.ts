/**
 * settings-store.ts
 * Persists user settings to GCS so they survive Cloud Run container restarts.
 * Keys are stored in a private bucket — never exposed in logs or responses.
 */

import { Storage } from '@google-cloud/storage';

const BUCKET = process.env.GCS_BUCKET_NAME || 'devrel-empire-images';
const SETTINGS_FILE = 'config/settings.json';

const storage = new Storage();

// In-memory cache
let _settings: Record<string, string | boolean> = {};

/** Load settings from GCS on startup. Falls back silently if file doesn't exist. */
export async function loadSettings(): Promise<void> {
    try {
        const bucket = storage.bucket(BUCKET);
        const file = bucket.file(SETTINGS_FILE);
        const [exists] = await file.exists();
        if (!exists) {
            console.log('[Settings] No saved settings found in GCS. Using env vars.');
            return;
        }
        const [content] = await file.download();
        _settings = JSON.parse(content.toString());
        console.log('[Settings] Loaded settings from GCS successfully.');

        // Apply loaded settings to process.env so rest of the app picks them up
        applyToEnv(_settings);
    } catch (err: any) {
        console.warn('[Settings] Could not load settings from GCS:', err.message);
    }
}

/** Save settings to GCS. Only stores fields that are provided. */
export async function saveSettings(updates: Record<string, string | boolean>): Promise<void> {
    // Merge new updates into current
    _settings = { ..._settings, ...updates };

    try {
        const bucket = storage.bucket(BUCKET);
        const file = bucket.file(SETTINGS_FILE);
        await file.save(JSON.stringify(_settings, null, 2), {
            contentType: 'application/json',
            // Keep it private — not public
            predefinedAcl: 'projectPrivate',
        });
        console.log('[Settings] Saved settings to GCS successfully.');
    } catch (err: any) {
        console.warn('[Settings] Could not persist settings to GCS:', err.message);
        // Still works in-memory for this session even if GCS save fails
    }
}

/** Apply settings map to process.env */
function applyToEnv(settings: Record<string, string | boolean>): void {
    const keyMap: Record<string, string> = {
        notionToken: 'NOTION_API_TOKEN',
        notionDb: 'NOTION_DATABASE_ID',
        geminiKey: 'GEMINI_API_KEY',
        devKey: 'DEV_API_KEY',
        gcsBucket: 'GCS_BUCKET_NAME',
        hashnodeKey: 'HASHNODE_API_KEY',
        hashnodePubId: 'HASHNODE_PUBLICATION_ID',
        mediumKey: 'MEDIUM_API_KEY',
        enableDev: 'ENABLE_DEV',
        enableHashnode: 'ENABLE_HASHNODE',
        enableMedium: 'ENABLE_MEDIUM',
    };

    for (const [field, envVar] of Object.entries(keyMap)) {
        if (settings[field] !== undefined && settings[field] !== '') {
            process.env[envVar] = String(settings[field]);
        }
    }
}

/** Get current in-memory boolean states (for GET /api/settings) */
export function getSettingsState() {
    return {
        enableDev: process.env.ENABLE_DEV !== 'false',
        enableHashnode: process.env.ENABLE_HASHNODE !== 'false',
        enableMedium: process.env.ENABLE_MEDIUM !== 'false',
        hasDevKey: !!process.env.DEV_API_KEY && process.env.DEV_API_KEY !== 'placeholder',
        hasHashnodeKey: !!process.env.HASHNODE_API_KEY && process.env.HASHNODE_API_KEY !== 'placeholder',
        hasMediumKey: !!process.env.MEDIUM_API_KEY && process.env.MEDIUM_API_KEY !== 'placeholder',
        hasNotionToken: !!process.env.NOTION_API_TOKEN,
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        hasNotionDb: !!process.env.NOTION_DATABASE_ID,
    };
}
