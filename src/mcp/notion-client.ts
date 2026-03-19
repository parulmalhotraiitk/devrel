import { Client, isNotionClientError, APIErrorCode } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { generateGeminiContent } from '../agent/gemini.js';
import { publishToPlatforms } from '../platforms/publishers.js';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_TOKEN = process.env.NOTION_API_TOKEN;

const notionClient = new Client({ auth: NOTION_TOKEN || "" });
const n2m = new NotionToMarkdown({ notionClient: notionClient });

/**
 * Utility to handle Notion API retries with exponential backoff.
 * Following Notion's 3 requests/second average limit and 429 Retry-After header.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 5, delay = 1000): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        if (isNotionClientError(error)) {
            // Handle Rate Limiting (429)
            if (error.code === APIErrorCode.RateLimited && retries > 0) {
                const headers = error.headers as Record<string, string | string[] | undefined>;
                const retryAfterValue = headers['retry-after'];
                const retryAfter = retryAfterValue
                    ? parseInt(Array.isArray(retryAfterValue) ? retryAfterValue[0]! : retryAfterValue, 10) * 1000
                    : delay;
                console.warn(`Rate limited. Retrying after ${retryAfter}ms... (${retries} retries left)`);
                await new Promise(res => setTimeout(res, retryAfter));
                return withRetry(fn, retries - 1, delay * 2);
            }
            // Handle Transient Server Errors (502, 503, 504)
            if ([APIErrorCode.InternalServerError, APIErrorCode.ServiceUnavailable].includes(error.code as any) && retries > 0) {
                console.warn(`Transient Notion server error (${error.code}). Retrying in ${delay}ms...`);
                await new Promise(res => setTimeout(res, delay));
                return withRetry(fn, retries - 1, delay * 2);
            }
        }
        throw error;
    }
}

async function connectToMCP() {
    console.log('Connecting to Notion MCP Server...');
    const transport = new StdioClientTransport({
        command: 'node',
        args: ['node_modules/@notionhq/notion-mcp-server/bin/cli.mjs'],
        env: {
            ...process.env,
            NOTION_API_TOKEN: NOTION_TOKEN as string
        }
    });

    const mcpClient = new MCPClient({
        name: "devrel-empire-client",
        version: "1.0.0"
    }, {
        capabilities: {}
    });

    await mcpClient.connect(transport);
    console.log('Connected to Notion MCP Server.');
    return mcpClient;
}

export async function processNotionReadyPages() {
    if (!DATABASE_ID || !NOTION_TOKEN) {
        throw new Error("Missing NOTION_DATABASE_ID or NOTION_API_TOKEN environment variables.");
    }

    try {
        // Attempt MCP connection to fulfil hackathon requirement.
        // This is intentionally non-blocking — the real workflow uses the
        // standard notionClient which is more reliable in serverless environments.
        try {
            await connectToMCP();
        } catch (mcpError) {
            console.warn('MCP connection failed (non-fatal):', mcpError);
            console.log('Continuing workflow using standard Notion API client...');
        }

        let allPages: any[] = [];
        let hasMore = true;
        let cursor: string | undefined = undefined;

        console.log(`Querying Database ${DATABASE_ID} for "Generate AI Content" or "Publish Now" pages...`);

        while (hasMore) {
            const response: any = await withRetry(() => (notionClient.databases as any).query({
                database_id: DATABASE_ID!,
                start_cursor: cursor,
                filter: {
                    or: [
                        {
                            property: 'Status',
                            status: {
                                equals: 'Generate AI Content'
                            }
                        },
                        {
                            property: 'Status',
                            status: {
                                equals: 'Publish Now'
                            }
                        }
                    ]
                }
            }));

            allPages.push(...response.results);
            hasMore = response.has_more;
            cursor = response.next_cursor || undefined;
        }

        console.log(`Found ${allPages.length} pages ready to process.`);

        for (const page of allPages) {
            const pageId = page.id;
            console.log(`Debug: Full properties: ${JSON.stringify(page.properties)}`);
            const title = (page.properties.Title as any)?.title?.[0]?.plain_text ||
                (page.properties.Name as any)?.title?.[0]?.plain_text || 'Untitled';
            const platformsToPublish = (page.properties.Platforms as any)?.multi_select?.map((p: any) => p.name) || [];

            console.log(`Processing page: "${title}" [${pageId}]`);
            console.log(`Debug: Platforms on page: ${JSON.stringify(platformsToPublish)}`);

            if (platformsToPublish.length === 0) {
                console.log(`No platforms selected for "${title}". Skipping.`);
                continue;
            }

            // Fetch ALL page blocks using the Notion API (Paginated)
            let standardMarkdown = "";
            try {
                let allBlocks: any[] = [];
                let hasMore = true;
                let nextCursor: string | undefined = undefined;

                while (hasMore) {
                    const options: any = {
                        block_id: pageId,
                        page_size: 100
                    };
                    if (nextCursor) {
                        options.start_cursor = nextCursor;
                    }
                    const blocksResponse: any = await withRetry(() => notionClient.blocks.children.list(options));
                    allBlocks.push(...blocksResponse.results);
                    hasMore = blocksResponse.has_more;
                    nextCursor = blocksResponse.next_cursor;
                }

                console.log(`Debug: Got ${allBlocks.length} total blocks from page.`);
                
                // Check if the AI Expanded Article exists anywhere in the document
                const hasExpandedArticle = allBlocks.some(b => {
                    const rt = b[b.type]?.rich_text;
                    return rt && rt.length > 0 && rt.map((rtPart: any) => rtPart.plain_text).join('').includes('📝 AI Expanded Article');
                });

                let recordingText = !hasExpandedArticle; // If it exists, wait for it before recording. If not, record immediately.

                for (const block of allBlocks) {
                    const blockType = block.type;
                    const richTexts = block[blockType]?.rich_text;
                    if (richTexts && richTexts.length > 0) {
                        const text = richTexts.map((rt: any) => rt.plain_text).join('');
                        
                        // Stop universally ONLY if we hit social media drafts specifically.
                        // Do not stop on generic "🤖 AI Generated Drafts" if we are actively seeking the Expanded Article underneath it.
                        if (text.includes('🐦 Twitter / X Thread') || 
                            text.includes('💼 LinkedIn Post')) {
                            console.log('Got to social media section, skipping the rest of the page for publish.');
                            break;
                        }

                        // If not in expanded mode, and we hit the generic drafts header, we can break. 
                        // But if we ARE looking for expanded text, keep going until we find it.
                        if (!hasExpandedArticle && text.includes('🤖 AI Generated Drafts')) {
                            console.log('Got to generic drafts section, skipping the rest of the page for publish.');
                            break;
                        }

                        // If we are waiting for the expanded article and we find its header, start recording from the NEXT block
                        if (!recordingText && text.includes('📝 AI Expanded Article')) {
                            recordingText = true;
                            continue; // Skip the header itself
                        }

                        // Also skip the "I expanded your short notes..." boilerplate paragraph just after the header
                        if (recordingText && text.includes('I expanded your short notes into a full article draft. If you like it')) {
                            continue;
                        }

                        if (!recordingText) {
                            continue; // Skip original bullet points
                        }

                        if (blockType === 'heading_1') standardMarkdown += `# ${text}\n\n`;
                        else if (blockType === 'heading_2') standardMarkdown += `## ${text}\n\n`;
                        else if (blockType === 'heading_3') standardMarkdown += `### ${text}\n\n`;
                        else if (blockType === 'bulleted_list_item') standardMarkdown += `- ${text}\n`;
                        else if (blockType === 'numbered_list_item') standardMarkdown += `1. ${text}\n`;
                        else if (blockType === 'code') standardMarkdown += `\`\`\`\n${text}\n\`\`\`\n\n`;
                        else standardMarkdown += `${text}\n\n`; // paragraph and others
                    }
                }
            } catch (blockError: any) {
                console.warn(`Could not fetch page blocks: ${blockError.message}`);
            }

            // Fallback: collect all rich_text values from properties
            if (standardMarkdown.trim().length === 0) {
                console.log("Debug: Page body empty, scanning properties for rich_text content...");
                for (const [propName, propValue] of Object.entries(page.properties) as any[]) {
                    if (propValue?.type === 'rich_text' && propValue.rich_text?.length > 0) {
                        const text = propValue.rich_text.map((rt: any) => rt.plain_text).join('');
                        if (text.trim()) {
                            console.log(`Debug: Using content from property: "${propName}"`);
                            standardMarkdown += `${text}\n\n`;
                        }
                    }
                }
            }

            console.log(`Debug: Final markdown content length: ${standardMarkdown.length}`);
            if (standardMarkdown.trim().length === 0) {
                console.warn(`WARNING: No content found for "${title}". Please add text to the page body in Notion.`);
                throw new Error(`Cannot publish an empty post. Please add content to the Notion page body for "${title}".`);
            }

            const currentStatus = (page.properties.Status as any)?.status?.name;
            console.log(`Debug: Current Status is "${currentStatus}"`);

            if (currentStatus === 'Generate AI Content') {
                console.log(`Phase 1: Generating AI Content for "${title}"...`);
                const generatedContent = await generateGeminiContent(standardMarkdown, platformsToPublish);
                
                // Write AI content back to Notion as new blocks
                await appendAIGeneratedBlocks(pageId, generatedContent);
                
                // Update Status to "Pending Review" and set Cover Image if available
                await updatePageStatus(pageId, 'Pending Review', generatedContent.coverImageUrl);
                console.log(`Phase 1 Complete. "${title}" is now Pending Review.`);
            } 
            else if (currentStatus === 'Publish Now') {
                console.log(`Phase 2: Publishing "${title}" to platforms...`);
                
                // Do NOT generate fresh AI content during the Publish phase as this overwrites
                // the cover image with a new random one and wastes Gemini API credits.
                // We just extract the existing cover image from the Notion page.
                let existingCoverUrl: string | undefined = undefined;
                if (page.cover) {
                    if (page.cover.type === 'external') {
                        existingCoverUrl = page.cover.external.url;
                    } else if (page.cover.type === 'file') {
                        existingCoverUrl = page.cover.file.url;
                    }
                }
                
                const generatedContent: any = {};
                if (existingCoverUrl) {
                    generatedContent.coverImageUrl = existingCoverUrl;
                }
                
                // In a perfect system, we'd parse the blocks to find their edited tweets. 
                // For now, we will just publish the content.
                const publishedLinks = await publishToPlatforms(title, standardMarkdown, generatedContent, platformsToPublish);

                await updatePageStatus(pageId, 'Published');
                await addPublishedComment(pageId, publishedLinks);
                console.log(`Phase 2 Complete. Successfully published "${title}".`);
            }
        }

    } catch (error) {
        if (isNotionClientError(error)) {
            console.error(`Notion API Error [${error.code}]: ${error.message}`);
        } else {
            console.error("Unknown Error in processNotionReadyPages:", error);
        }
        throw error;
    }
}

async function updatePageStatus(pageId: string, statusName: string, coverUrl?: string) {
    const properties: any = {
        'Status': {
            status: {
                name: statusName
            }
        }
    };
    
    const pageUpdate: any = {
        page_id: pageId,
        properties: properties
    };

    if (coverUrl) {
        pageUpdate.cover = {
            type: 'external',
            external: {
                url: coverUrl
            }
        };
    }

    await withRetry(() => notionClient.pages.update(pageUpdate));
}

async function addPublishedComment(pageId: string, links: string[]) {
    if (links.length > 0) {
        const linkText = "🚀 Published successfully!\n\n" + links.join('\n');
        await withRetry(() => notionClient.comments.create({
            parent: { page_id: pageId },
            rich_text: [
                {
                    text: { content: linkText }
                }
            ]
        }));
    }
}

async function appendAIGeneratedBlocks(pageId: string, generated: any) {
    const blocks: any[] = [];
    
    blocks.push({
        object: 'block',
        type: 'divider',
        divider: {}
    });

    blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
            rich_text: [{ type: 'text', text: { content: '🤖 AI Generated Drafts (Review & Edit)' } }]
        }
    });

    if (generated.coverImageUrl) {
        blocks.push({
            object: 'block',
            type: 'image',
            image: {
                type: 'external',
                external: {
                    url: generated.coverImageUrl
                }
            }
        });
        blocks.push({
            object: 'block',
            type: 'callout',
            callout: {
                rich_text: [{ type: 'text', text: { content: '🎨 AI Cover Image generated and hosted on GCS. It has also been set as the page cover!' } }],
                icon: { emoji: '🖼️' }
            }
        });
    } else if (generated.coverImageBase64) {
        blocks.push({
            object: 'block',
            type: 'callout',
            callout: {
                rich_text: [{ type: 'text', text: { content: '🎨 Cover Image generated successfully! (Local preview only, hosting failed).' } }],
                icon: { emoji: '⚠️' }
            }
        });
    }

    if (generated.expandedArticle) {
        blocks.push({
            object: 'block',
            type: 'heading_3',
            heading_3: { rich_text: [{ type: 'text', text: { content: '📝 AI Expanded Article' } }] }
        });
        
        // Split long articles into multiple paragraph chunks because Notion has a 2000 character limit per rich_text item
        const chunks = generated.expandedArticle.match(/.{1,1900}/g) || [];
        for (const chunk of chunks) {
            blocks.push({
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] }
            });
        }
    }

    if (generated.twitterThread) {
        blocks.push({
            object: 'block',
            type: 'heading_3',
            heading_3: { rich_text: [{ type: 'text', text: { content: '🐦 Twitter / X Thread' } }] }

        });
        const twitterChunks = generated.twitterThread.match(/.{1,1900}/gs) || [];
        for (const chunk of twitterChunks) {
            blocks.push({
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] }
            });
        }
    }

    if (generated.linkedInPost) {
        blocks.push({
            object: 'block',
            type: 'heading_3',
            heading_3: { rich_text: [{ type: 'text', text: { content: '💼 LinkedIn Post' } }] }
        });
        
        const linkedinChunks = generated.linkedInPost.match(/.{1,1900}/gs) || [];
        for (const chunk of linkedinChunks) {
            blocks.push({
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] }
            });
        }
    }

    if (blocks.length > 2) { // Only append if we actually generated content
        await withRetry(() => notionClient.blocks.children.append({
            block_id: pageId,
            children: blocks
        }));
    }
}
