import axios from 'axios';
import type { GeneratedContent } from '../agent/gemini.js';
import dotenv from 'dotenv';

dotenv.config();

export async function publishToPlatforms(
    title: string,
    markdown: string,
    generatedData: GeneratedContent,
    platforms: string[]
): Promise<string[]> {
    const publishedLinks: string[] = [];
    
    // Read directly from env to ensure we get live updates from the UI
    const DEV_API_KEY = process.env.DEV_API_KEY;
    const HASHNODE_API_KEY = process.env.HASHNODE_API_KEY;
    const MEDIUM_API_KEY = process.env.MEDIUM_API_KEY;
    
    const enableDev = process.env.ENABLE_DEV !== 'false';
    const enableHashnode = process.env.ENABLE_HASHNODE !== 'false';
    const enableMedium = process.env.ENABLE_MEDIUM !== 'false';

    console.log(`Debug: Platforms received for publishing: ${JSON.stringify(platforms)}`);

    // DEV.to
    if (enableDev && platforms.includes('DEV.to') && DEV_API_KEY) {
        console.log(`Publishing to DEV.to... Title: "${title}"`);
        try {
            const res = await axios.post('https://dev.to/api/articles', {
                article: {
                    title: title,
                    body_markdown: markdown,
                    published: true,
                    main_image: generatedData.coverImageUrl
                }
            }, {
                headers: { 'api-key': DEV_API_KEY }
            });
            console.log(`DEV.to response data keys: ${JSON.stringify(Object.keys(res.data))}`);
            // DEV.to returns url at data.url (not data.article.url)
            const articleUrl = res.data.url || res.data.article?.url || `https://dev.to/article/${res.data.id}`;
            publishedLinks.push(`DEV.to: ${articleUrl}`);
            console.log(`Successfully published to DEV.to: ${articleUrl}`);
        } catch (error: any) {
            const errorData = error?.response?.data;
            console.error('CRITICAL: Failed to publish to DEV.to:', errorData ? JSON.stringify(errorData) : error.message);
        }
    }

    // Hashnode (v3 API - https://gql.hashnode.com/)
    if (enableHashnode && platforms.includes('Hashnode') && HASHNODE_API_KEY && HASHNODE_API_KEY !== 'placeholder') {
        console.log(`Publishing to Hashnode...`);
        try {
            const publicationId = process.env.HASHNODE_PUBLICATION_ID;
            if (!publicationId || publicationId === 'placeholder') {
                console.error('Hashnode: HASHNODE_PUBLICATION_ID is missing or invalid.');
            } else {
                // Step 2: Publish the post
                const publishQuery = `
                    mutation PublishPost($input: PublishPostInput!) {
                        publishPost(input: $input) {
                            post { url title }
                        }
                    }
                `;
                const coverImageOptions = generatedData.coverImageUrl ? { coverImageURL: generatedData.coverImageUrl } : undefined;
                const publishInput: any = {
                    title,
                    contentMarkdown: markdown,
                    publicationId,
                };
                if (coverImageOptions) publishInput.coverImageOptions = coverImageOptions;

                const publishRes = await axios.post('https://gql.hashnode.com/', {
                    query: publishQuery,
                    variables: { input: publishInput }
                }, {
                    headers: { 'Authorization': HASHNODE_API_KEY }
                });
                
                const postUrl = publishRes.data?.data?.publishPost?.post?.url;
                if (postUrl) {
                    publishedLinks.push(`Hashnode: ${postUrl}`);
                    console.log(`Successfully published to Hashnode: ${postUrl}`);
                } else if (publishRes.data?.errors) {
                    console.error('Hashnode publish failed:', JSON.stringify(publishRes.data.errors));
                }
            }
        } catch (error: any) {
            console.error('Failed to publish to Hashnode:', error?.response?.data || error.message);
        }
    }

    // Medium
    if (enableMedium && platforms.includes('Medium') && MEDIUM_API_KEY) {
        console.log(`Publishing to Medium...`);
        try {
            // 1. Get user ID from token
            const userRes = await axios.get('https://api.medium.com/v1/me', {
                headers: { 'Authorization': `Bearer ${MEDIUM_API_KEY}` }
            });
            const authorId = userRes.data?.data?.id;

            if (authorId) {
                // 2. Post the article
                const postRes = await axios.post(`https://api.medium.com/v1/users/${authorId}/posts`, {
                    title: title,
                    contentFormat: 'markdown',
                    content: markdown,
                    publishStatus: 'public' // or 'draft'
                }, {
                    headers: { 'Authorization': `Bearer ${MEDIUM_API_KEY}` }
                });
                publishedLinks.push(`Medium: ${postRes.data?.data?.url}`);
                console.log(`Successfully published to Medium`);
            }
        } catch (error: any) {
            console.error('Failed to publish to Medium:', error?.response?.data || error.message);
        }
    }

    // Social Media Writebacks (Twitter/LinkedIn)
    // The previous implementation tried to append the full text of social media drafts
    // into the publishedLinks comment, which exceeded Notion's 2000 character `rich_text` limit.
    // They are already safely appended to the Notion page body during Phase 1 (Generate AI Content), 
    // so we simply omit them from the comment here to avoid crashing.

    return publishedLinks;
}
