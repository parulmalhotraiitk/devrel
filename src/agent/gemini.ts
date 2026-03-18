import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'devrel-empire-images';

// Initialize the new genai SDK correctly
let ai: GoogleGenAI | null = null;
if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

// Initialize GCS
const storage = new Storage();

export async function uploadToGCS(buffer: Buffer, mimeType: string): Promise<string> {
    const bucket = storage.bucket(GCS_BUCKET_NAME);
    const extension = mimeType.split('/')[1] || 'png';
    const fileName = `covers/${uuidv4()}.${extension}`;
    const blob = bucket.file(fileName);

    await blob.save(buffer, {
        contentType: mimeType,
        metadata: { cacheControl: 'public, max-age=31536000' }
    });

    return `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${fileName}`;
}

export interface GeneratedContent {
    expandedArticle?: string;
    twitterThread?: string;
    linkedInPost?: string;
    coverImageBase64?: string;
    coverImageUrl?: string;
}

export async function generateGeminiContent(
    markdown: string,
    platforms: string[]
): Promise<GeneratedContent> {
    const result: GeneratedContent = {};

    if (!ai) {
        console.warn("GEMINI_API_KEY is not set. Skipping AI generation steps.");
        return result;
    }

    // For the "Generate AI Content" phase, we'll generate everything by default
    const shouldGenTwitter = true;
    const shouldGenLinkedIn = true;
    const shouldGenImage = true;

    try {
        if (shouldGenImage) {
            console.log("Generating Cover Image using gemini-2.5-flash-image...");
            try {
                const imagePrompt = `A high-quality, professional blog post cover image, vibrant tech aesthetic, no text, representing this content: ${markdown.substring(0, 1000)}`;
                
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    config: {
                        responseModalities: ['IMAGE', 'TEXT'],
                    },
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: imagePrompt }],
                        },
                    ],
                });

                // Extract binary image data from multimodal response
                if (response.candidates?.[0]?.content?.parts) {
                    for (const part of response.candidates[0].content.parts) {
                        if (part.inlineData?.data && part.inlineData?.mimeType) {
                            const buffer = Buffer.from(part.inlineData.data, 'base64');
                            result.coverImageBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                            
                            // Upload to GCS and get public URL
                            try {
                                result.coverImageUrl = await uploadToGCS(buffer, part.inlineData.mimeType);
                                console.log(`Cover Image hosted at: ${result.coverImageUrl}`);
                            } catch (gcsErr: any) {
                                console.warn("Failed to host on GCS, falling back to local base64 only:", gcsErr.message);
                            }
                            
                            console.log("Cover Image generated successfully.");
                            break;
                        }
                    }
                }
            } catch (imgErr: any) {
                console.warn("Image generation failed:", imgErr.message);
            }
        }

        console.log("Generating Expanded Article using Gemini...");
        const articlePrompt = `
You are an expert DevRel technical writer. The user has provided some rough notes or a short draft for an article. 
Please expand these notes into a comprehensive, well-structured, and engaging technical blog post in Markdown format. 
If the notes are already a long article, just polish and optimize them. 
Do not include any greeting or conversational filler, just print the final Markdown article.

User Notes/Draft:
---
${markdown.substring(0, 4000)}
---
`;
        const articleRes: any = await ai.models.generateContent({
            model: 'gemini-2.5-flash', 
            contents: [{ parts: [{ text: articlePrompt }] }]
        });
        result.expandedArticle = articleRes.candidates?.[0]?.content?.parts?.[0]?.text || 
                             (articleRes.text ? articleRes.text() : "") || "";

        if (shouldGenTwitter) {
            console.log("Generating Twitter thread using Gemini...");
            const twitterPrompt = `
You are a developer relations expert. Turn the following technical article markdown into an engaging 5-part Twitter thread. 
Use hooks, appropriate tech emojis, and format it clearly with [1/5], [2/5], etc.
Article Markdown:
---
${markdown.substring(0, 4000)}
---
`;
            const twRes: any = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image', 
                contents: [{ parts: [{ text: twitterPrompt }] }]
            });
            // Robust check for text in the response
            result.twitterThread = twRes.candidates?.[0]?.content?.parts?.[0]?.text || 
                                 (twRes.text ? twRes.text() : "") || "";
        }

        if (shouldGenLinkedIn) {
            console.log("Generating LinkedIn post using Gemini...");
            const linkedinPrompt = `
You are a developer relations expert. Summarize the following technical article markdown into a professional but engaging LinkedIn post.
Article Markdown:
---
${markdown.substring(0, 4000)}
---
`;
            const lnRes: any = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: [{ parts: [{ text: linkedinPrompt }] }]
            });
            // Robust check for text in the response
            result.linkedInPost = lnRes.candidates?.[0]?.content?.parts?.[0]?.text || 
                                (lnRes.text ? lnRes.text() : "") || "";
        }

    } catch (error) {
        console.error("Error generating content via Gemini:", error);
    }

    return result;
}
