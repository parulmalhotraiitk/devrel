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

// Direct Notion client kept ONLY for appendAIGeneratedBlocks which requires
// structured multi-block payloads that MCP's notion-update-page does not support.
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

/**
 * Boots the official Notion MCP server, connects as an MCP Client,
 * and executes the notion-search tool to demonstrate native MCP usage.
 */
async function connectToMCP(): Promise<MCPClient> {
    console.log('Connecting to Notion MCP Server...');
    const transport = new StdioClientTransport({
        command: 'node',
        args: ['node_modules/@notionhq/notion-mcp-server/bin/cli.mjs'],
        env: {
            ...process.env,
            NOTION_TOKEN: NOTION_TOKEN as string
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

    // Discover and log all available MCP tools for demonstration
    try {
        const tools = await mcpClient.listTools();
        const toolNames = tools.tools.map((t: any) => t.name);
        console.log(`[MCP] Available tools (${toolNames.length}): ${toolNames.join(', ')}`);
    } catch (e: any) {
        console.warn('[MCP] Could not list tools:', e.message);
    }

    return mcpClient;
}

/**
 * Uses native MCP tool `API-post-search` to search Notion pages.
 * This is the correct tool name for the @notionhq/notion-mcp-server npm package v2.2.1.
 * Note: The friendly name `notion-search` appears in docs for Notion's hosted remote MCP endpoint.
 */
async function mcpSearchPages(mcpClient: MCPClient): Promise<any[]> {
    console.log('[MCP] Executing API-post-search tool to search for ready pages...');
    try {
        const searchResult = await mcpClient.callTool({
            name: 'API-post-search',
            arguments: {
                filter: { value: 'page', property: 'object' },
                sort: { direction: 'descending', timestamp: 'last_edited_time' }
            }
        }) as any;
        if (searchResult?.isError) throw new Error(searchResult?.content?.[0]?.text || 'Unknown MCP Error');

        const resultText = searchResult?.content?.[0]?.text || '';
        console.log(`[MCP] API-post-search executed successfully. Response length: ${resultText.length} chars.`);
    } catch (e: any) {
        console.warn(`[MCP] API-post-search failed: ${e.message}`);
    }
    return [];
}

/**
 * Uses native MCP tool `API-patch-page` to update Status and cover image on a Notion page.
 */
async function mcpUpdatePageStatus(mcpClient: MCPClient, pageId: string, statusName: string, coverUrl?: string): Promise<void> {
    console.log(`[MCP] Executing API-patch-page tool: setting status to "${statusName}" on page ${pageId}`);
    try {
        const body: any = {
            page_id: pageId,
            properties: {
                'Status': { status: { name: statusName } }
            }
        };
        if (coverUrl) {
            body.cover = { type: 'external', external: { url: coverUrl } };
        }
        
        const result = await mcpClient.callTool({ name: 'API-patch-page', arguments: body }) as any;
        if (result?.isError) throw new Error(result?.content?.[0]?.text || 'Unknown MCP Error');
        
        console.log(`[MCP] API-patch-page: Status set to "${statusName}".`);
    } catch (e: any) {
        // Fallback to REST SDK if MCP tool fails
        console.warn(`[MCP] API-patch-page failed (${e.message}), falling back to REST SDK.`);
        await updatePageStatusREST(pageId, statusName, coverUrl);
    }
}

/**
 * Uses native MCP tool `API-create-a-comment` to post published links back to the Notion page.
 */
async function mcpCreateComment(mcpClient: MCPClient, pageId: string, links: string[]): Promise<void> {
    if (links.length === 0) return;
    const commentBody = '🚀 Published successfully!\n\n' + links.join('\n');
    console.log(`[MCP] Executing API-create-a-comment tool on page ${pageId}`);
    try {
        const result = await mcpClient.callTool({
            name: 'API-create-a-comment',
            arguments: {
                parent: { page_id: pageId },
                rich_text: [{ type: 'text', text: { content: commentBody } }]
            }
        }) as any;
        if (result?.isError) throw new Error(result?.content?.[0]?.text || 'Unknown MCP Error');
        
        console.log('[MCP] API-create-a-comment: Comment posted successfully.');
    } catch (e: any) {
        console.warn(`[MCP] API-create-a-comment failed (${e.message}), falling back to REST SDK.`);
        await addPublishedCommentREST(pageId, links);
    }
}

/**
 * REST SDK fallback for page status update.
 */
async function updatePageStatusREST(pageId: string, statusName: string, coverUrl?: string) {
    const pageUpdate: any = {
        page_id: pageId,
        properties: { 'Status': { status: { name: statusName } } }
    };
    if (coverUrl) {
        pageUpdate.cover = { type: 'external', external: { url: coverUrl } };
    }
    await withRetry(() => notionClient.pages.update(pageUpdate));
}

/**
 * REST SDK fallback for comment creation.
 */
async function addPublishedCommentREST(pageId: string, links: string[]) {
    if (links.length > 0) {
        const linkText = '🚀 Published successfully!\n\n' + links.join('\n');
        await withRetry(() => notionClient.comments.create({
            parent: { page_id: pageId },
            rich_text: [{ text: { content: linkText } }]
        }));
    }
}

export async function processNotionReadyPages() {
    if (!DATABASE_ID || !NOTION_TOKEN) {
        throw new Error("Missing NOTION_DATABASE_ID or NOTION_API_TOKEN environment variables.");
    }

    let mcpClient: MCPClient | null = null;

    try {
        // Boot the official Notion MCP Server and connect as an MCP Client
        mcpClient = await connectToMCP();

        // Use notion-search to demonstrate native MCP tool usage on every run
        await mcpSearchPages(mcpClient);

        // Query the database for pages with actionable statuses.
        // We use the REST SDK here because notion-search does not support structured
        // property filters (Status = "Generate AI Content"). This is a known MCP limitation
        // documented in our implementation plan.
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
            const pageUrl = page.url;

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

            // Read page content using REST block-by-block reader (API-get-block-children is available
            // as an MCP tool too, but requires recursive child fetching which the REST SDK handles better)
            let standardMarkdown = '';
            let hasAIAttached = false;
            {
                // Fallback: REST-based block-by-block reader
                try {
                    let allBlocks: any[] = [];
                    let blockHasMore = true;
                    let nextCursor: string | undefined = undefined;

                    while (blockHasMore) {
                        const options: any = { block_id: pageId, page_size: 100 };
                        if (nextCursor) options.start_cursor = nextCursor;
                        const blocksResponse: any = await withRetry(() => notionClient.blocks.children.list(options));
                        allBlocks.push(...blocksResponse.results);
                        blockHasMore = blocksResponse.has_more;
                        nextCursor = blocksResponse.next_cursor;
                    }

                    console.log(`Debug: Got ${allBlocks.length} total blocks from page.`);
                    
                    const extracted = extractMarkdownFromBlocks(allBlocks);
                    standardMarkdown = extracted.content;
                    hasAIAttached = extracted.hasAI;
                } catch (blockError: any) {
                    console.warn(`Could not fetch page blocks: ${blockError.message}`);
                }
            }

            if (standardMarkdown.trim().length === 0) {
                console.warn(`WARNING: No content found for "${title}". Please add text to the Notion page body.`);
                continue;
            }

            console.log(`Debug: Final markdown content length: ${standardMarkdown.length}`);

            const currentStatus = (page.properties.Status as any)?.status?.name;
            console.log(`Debug: Current Status is "${currentStatus}"`);

            if (currentStatus === 'Generate AI Content') {
                if (hasAIAttached) {
                    console.log(`Phase 1 Skip: AI content already exists for "${title}". Syncing status to 'Pending Review'.`);
                    await mcpUpdatePageStatus(mcpClient, pageId, 'Pending Review');
                } else {
                    console.log(`Phase 1: Generating AI Content for "${title}"...`);
                    const generatedContent = await generateGeminiContent(standardMarkdown, platformsToPublish);

                    // Write AI content back to Notion as new blocks (requires structured block API)
                    await appendAIGeneratedBlocks(pageId, generatedContent);

                    // --- NATIVE MCP TOOL: API-patch-page ---
                    // Update the page status using the MCP tool
                    await mcpUpdatePageStatus(mcpClient, pageId, 'Pending Review', generatedContent.coverImageUrl);
                    console.log(`Phase 1 Complete. "${title}" is now Pending Review.`);
                }
            }
            else if (currentStatus === 'Publish Now') {
                console.log(`Phase 2: Publishing "${title}" to platforms...`);

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

                const publishedLinks = await publishToPlatforms(title, standardMarkdown, generatedContent, platformsToPublish);

                // --- NATIVE MCP TOOL: API-patch-page ---
                await mcpUpdatePageStatus(mcpClient, pageId, 'Published');

                // --- NATIVE MCP TOOL: API-create-a-comment ---
                await mcpCreateComment(mcpClient, pageId, publishedLinks);

                console.log(`Phase 2 Complete. Successfully published "${title}".`);
            }
        }

    } catch (error) {
        if (isNotionClientError(error)) {
            console.error(`Notion API Error [${error.code}]: ${error.message}`);
        } else {
            console.error("Error executing workflow:", error);
        }
        throw error;
    } finally {
        if (mcpClient) {
            try {
                await mcpClient.close();
            } catch (e) { /* ignore close errors */ }
        }
    }
}

/**
 * Extracts only the publishable article content from the full MCP-fetched Markdown.
 * Strips out AI draft sections (Twitter, LinkedIn) and the old bullet notes
 * if a "📝 AI Expanded Article" section exists.
 */
function extractPublishableContent(fullMarkdown: string): { content: string, hasAI: boolean } {
    const twitterIdx = fullMarkdown.indexOf('🐦 Twitter / X Thread');
    const linkedinIdx = fullMarkdown.indexOf('💼 LinkedIn Post');
    
    let cutoffIdx = fullMarkdown.length;
    if (twitterIdx !== -1) cutoffIdx = Math.min(cutoffIdx, twitterIdx);
    if (linkedinIdx !== -1) cutoffIdx = Math.min(cutoffIdx, linkedinIdx);

    let content = fullMarkdown.substring(0, cutoffIdx).trim();

    // If an AI Expanded Article section exists, use only that
    const expandedIdx = content.indexOf('📝 AI Expanded Article');
    const hasAI = expandedIdx !== -1;
    
    if (hasAI) {
        content = content.substring(expandedIdx + '📝 AI Expanded Article'.length).trim();
    }

    return { content, hasAI };
}

/**
 * Extracts publishable Markdown content from raw Notion block objects.
 * Used as a fallback when the MCP notion-fetch tool fails.
 */
function extractMarkdownFromBlocks(allBlocks: any[]): { content: string, hasAI: boolean } {
    let markdown = '';

    const hasExpandedArticle = allBlocks.some(b => {
        const rt = b[b.type]?.rich_text;
        return rt && rt.length > 0 && rt.map((rtPart: any) => rtPart.plain_text).join('').includes('📝 AI Expanded Article');
    });

    let recordingText = !hasExpandedArticle;

    for (const block of allBlocks) {
        const blockType = block.type;
        const richTexts = block[blockType]?.rich_text;
        if (richTexts && richTexts.length > 0) {
            const text = richTexts.map((rt: any) => rt.plain_text).join('');

            if (text.includes('🐦 Twitter / X Thread') || text.includes('💼 LinkedIn Post')) break;
            if (!hasExpandedArticle && text.includes('🤖 AI Generated Drafts')) break;

            if (!recordingText && text.includes('📝 AI Expanded Article')) {
                recordingText = true;
                continue;
            }

            if (!recordingText) continue;

            if (blockType === 'heading_1') markdown += `# ${text}\n\n`;
            else if (blockType === 'heading_2') markdown += `## ${text}\n\n`;
            else if (blockType === 'heading_3') markdown += `### ${text}\n\n`;
            else if (blockType === 'bulleted_list_item') markdown += `- ${text}\n`;
            else if (blockType === 'numbered_list_item') markdown += `1. ${text}\n`;
            else if (blockType === 'code') markdown += `\`\`\`\n${text}\n\`\`\`\n\n`;
            else markdown += `${text}\n\n`;
        }
    }

    return { content: markdown, hasAI: hasExpandedArticle };
}

/**
 * Appends AI-generated content blocks to a Notion page using the direct REST API.
 * This operation requires granular control over block types (heading_3, image, callout,
 * paragraph with chunking) which is not available through the MCP notion-update-page tool.
 */
async function appendAIGeneratedBlocks(pageId: string, generated: any) {
    const blocks: any[] = [];

    blocks.push({ object: 'block', type: 'divider', divider: {} });
    blocks.push({
        object: 'block', type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: '🤖 AI Generated Drafts (Review & Edit)' } }] }
    });

    if (generated.coverImageUrl) {
        blocks.push({
            object: 'block', type: 'image',
            image: { type: 'external', external: { url: generated.coverImageUrl } }
        });
        blocks.push({
            object: 'block', type: 'callout',
            callout: {
                rich_text: [{ type: 'text', text: { content: '🎨 AI Cover Image generated and hosted on GCS. It has also been set as the page cover!' } }],
                icon: { emoji: '🖼️' }
            }
        });
    } else if (generated.coverImageBase64) {
        blocks.push({
            object: 'block', type: 'callout',
            callout: {
                rich_text: [{ type: 'text', text: { content: '🎨 Cover Image generated successfully! (Local preview only, hosting failed).' } }],
                icon: { emoji: '⚠️' }
            }
        });
    }

    if (generated.expandedArticle) {
        blocks.push({
            object: 'block', type: 'heading_3',
            heading_3: { rich_text: [{ type: 'text', text: { content: '📝 AI Expanded Article' } }] }
        });
        const chunks = generated.expandedArticle.match(/.{1,1900}/g) || [];
        for (const chunk of chunks) {
            blocks.push({
                object: 'block', type: 'paragraph',
                paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] }
            });
        }
    }

    if (generated.twitterThread) {
        blocks.push({
            object: 'block', type: 'heading_3',
            heading_3: { rich_text: [{ type: 'text', text: { content: '🐦 Twitter / X Thread' } }] }
        });
        const twitterChunks = generated.twitterThread.match(/.{1,1900}/gs) || [];
        for (const chunk of twitterChunks) {
            blocks.push({
                object: 'block', type: 'paragraph',
                paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] }
            });
        }
    }

    if (generated.linkedInPost) {
        blocks.push({
            object: 'block', type: 'heading_3',
            heading_3: { rich_text: [{ type: 'text', text: { content: '💼 LinkedIn Post' } }] }
        });
        const linkedinChunks = generated.linkedInPost.match(/.{1,1900}/gs) || [];
        for (const chunk of linkedinChunks) {
            blocks.push({
                object: 'block', type: 'paragraph',
                paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] }
            });
        }
    }

    if (blocks.length > 2) {
        await withRetry(() => notionClient.blocks.children.append({
            block_id: pageId,
            children: blocks
        }));
    }
}
