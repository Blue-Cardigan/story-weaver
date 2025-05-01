import { GoogleGenAI, Content, GenerationConfig, Part } from "@google/genai";
import { NextResponse } from 'next/server';
// Import types from the central types file
import type { ContextParagraphData, EditProposal } from "@/types/chat";

// --- Environment Variable Check ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  // Log the error on the server for debugging
  console.error("FATAL ERROR: GEMINI_API_KEY environment variable is not set.");
  // Return a generic error to the client, avoiding exposure of internal details
  throw new Error("Server configuration error: API key is missing.");
}

// --- Initialize Gemini Client ---
// Corrected instantiation, ensuring it uses the validated apiKey
const genAI = new GoogleGenAI({ apiKey: apiKey });

// --- Generation Configuration ---
const generationConfig: GenerationConfig = {
  temperature: 0.3, // Lower temperature for more predictable JSON output
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 2048, // Adjust as needed
  responseMimeType: "application/json", // Request JSON output explicitly
};

// --- Helper Function to Create System Instruction ---
// SIMPLIFIED: Remove dynamic context, keep static instructions
function getSystemInstructionText(): string {
    // Instructions for the AI - Emphasize index scope
    const instructions =
`You are an expert writing assistant specializing in proposing edits based on user requests and provided context.

IMPORTANT: Respond ONLY with a valid JSON object. Do NOT include any text outside this JSON object.
The JSON object must have the following fields:
- "type": (string) One of "replace", "insert", "delete", "clarification", "none", "replace_all".
- "explanation": (string) Your reasoning or clarifying questions.
- "contextParagraphIndices": (number[], optional) If the edit applies specifically to one or more [Paragraph N] blocks from the *most recent user message*, provide the artificial index/indices (N) here (e.g., [0], or [1, 2]). Only use indices explicitly marked in the *latest* message. OMIT this field otherwise.
- "text": (string, optional) Required for 'replace', 'insert', and 'replace_all'. For 'replace_all', this should be the *entire* new text content.
- "startIndex": (number, optional) Required for 'replace', 'insert', 'delete' *unless* 'contextParagraphIndices' is used. Character index where the edit begins.
- "endIndex": (number, optional) Required for 'replace', 'delete' *unless* 'contextParagraphIndices' is used. Character index where the edit ends (exclusive for delete/replace).

Guidelines:
- Use 'replace_all' for requests that rewrite the entire text (e.g., "make it shorter", "summarize", "change the tone"). 'text' must contain the complete new version. Do *not* provide 'startIndex' or 'endIndex' for 'replace_all'.
- Use 'contextParagraphIndices' *only* for paragraphs marked [Paragraph N] in the current request. If this field is omitted, you must calculate 'startIndex'/'endIndex' yourself for 'replace', 'insert', or 'delete'.
- If the user's request is unclear or ambiguous, use type "clarification".
- If no change is needed based on the request, use type "none".
`;
    return instructions;
}

// --- POST Handler ---
export async function POST(request: Request) {
  try {
    // Extract contextParagraphData (and rename previous contextParagraphs)
    const { messages, currentStory, userRequest, selections, contextParagraphData } = await request.json();
    const originalContextData: ContextParagraphData[] = contextParagraphData || []; // Keep original data

    // Basic validation
    if (!Array.isArray(messages) || !currentStory || !userRequest) {
      return NextResponse.json({ error: 'Missing required fields: messages, currentStory, userRequest' }, { status: 400 });
    }

    // Get the STATIC system instruction text
    const systemInstructionText = getSystemInstructionText();

    // --- Construct Contextual User Prompt ---
    let contextualUserPrompt = userRequest; // Start with the actual user text

    // Add context paragraph text using artificial indices
    const hasContextParagraphs = originalContextData && originalContextData.length > 0;
    if (hasContextParagraphs) {
        const contextParagraphText = `\n\nThe following ${originalContextData.length === 1 ? 'paragraph was' : 'paragraphs were'} specifically selected for context (marked [Paragraph N]):\n${originalContextData.map((data, artificialIndex) => `[Paragraph ${artificialIndex}] "${data.text.replace(/"/g, '\\"')}"`).join("\n")}`;
        contextualUserPrompt += contextParagraphText;
    }

     // Add general selections text
     const currentSelections = selections || [];
     if (currentSelections.length > 0) {
        const selectionText = `\n\nThe user also highlighted the following text selection(s) for general context:\n${currentSelections.map((s: string) => `- "${s.replace(/"/g, '\\"')}"`).join("\n")}`;
        contextualUserPrompt += selectionText;
    }

    // Add the main story context IF it wasn't already part of the selections/paragraphs
    // (Avoid redundancy if the user selected the entire story)
    // We might need a more sophisticated check, but for now, always add it if present.
    if (currentStory) {
        const storyContextText = `\n\nFull Story Context for reference:\n--- START STORY CONTEXT ---\n${currentStory}\n--- END STORY CONTEXT ---`;
        contextualUserPrompt += storyContextText;
    }
    // --- End Contextual User Prompt Construction ---


    // Construct the contents array: NEW USER PROMPT ONLY
    const contents: Content[] = [{ role: "user", parts: [{ text: contextualUserPrompt }] }];

    // Correctly structure the request options according to documentation
    const requestOptions = {
        model: "gemini-2.0-flash", // Specify the model here
        contents: contents,        // Pass contents here
        config: {                  // Nest config items under 'config'
            generationConfig: generationConfig,
            systemInstruction: {
                parts: [{ text: systemInstructionText }] // Use the static system instruction
            }
        }
    };

    // Make the API call using generateContent on genAI.models
    const result = await genAI.models.generateContent(requestOptions);

    // --- Process Response (Using result.candidates) ---
    // Accessing the response via candidates[0].content.parts[0].text
    const responseContent = result.candidates?.[0]?.content;
    if (
      !responseContent ||
      !responseContent.parts ||
      responseContent.parts.length === 0 ||
      !responseContent.parts[0].text
    ) {
      console.error("Invalid response structure from Gemini API:", JSON.stringify(result, null, 2)); // Log the full result object
      throw new Error("Received an invalid or empty response from the AI model.");
    }

    const rawResponseText = responseContent.parts[0].text;
    console.log("Raw AI Response:", rawResponseText);

    // Attempt to parse the JSON response with robust extraction
    let llmProposal: Partial<EditProposal> = {};
    let jsonString: string | null = null;

    try {
        // 1. Try extracting from ```json ... ``` fences
        const fenceMatch = rawResponseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (fenceMatch && fenceMatch[1]) {
            jsonString = fenceMatch[1].trim();
        } else {
            // 2. Fallback: Find first '{' and last '}'
            const firstBrace = rawResponseText.indexOf('{');
            const lastBrace = rawResponseText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                jsonString = rawResponseText.substring(firstBrace, lastBrace + 1).trim();
            }
        }

        if (jsonString) {
            llmProposal = JSON.parse(jsonString);
             // Basic validation of the parsed structure
            if (!llmProposal.type || !llmProposal.explanation) {
                // Throw error to be caught below if essential fields are missing
                throw new Error("Parsed JSON missing required fields 'type' or 'explanation'.");
            }
        } else {
            // Throw error if no JSON structure could be extracted
            throw new Error("Could not extract valid JSON block from the response.");
        }

    } catch (parseError: any) {
        console.error("Failed to parse AI response as JSON:", parseError);
        console.error("Extracted string that failed parsing (if any):", jsonString);
        console.error("Original raw text that failed parsing:", rawResponseText);
        // Fallback: return the raw text as a clarification request
        const fallbackProposal: EditProposal = {
            type: "clarification",
            explanation: `I couldn't structure the response correctly. Here's the raw suggestion: ${rawResponseText}`
        };
        return NextResponse.json(fallbackProposal);
    }

    // --- Construct Final EditProposal ---
    let finalProposal: EditProposal = {
        type: llmProposal.type!, // Assert non-null based on prior validation
        explanation: llmProposal.explanation!, // Assert non-null
        text: llmProposal.text, // Keep optional text
    };

    // --- Validation Logic ---

    // Handle 'replace_all' separately first
    if (finalProposal.type === 'replace_all') {
        if (finalProposal.text === undefined || typeof finalProposal.text !== 'string') {
            console.warn(`LLM proposal type 'replace_all' missing or invalid required field 'text'.`);
            finalProposal.type = 'clarification';
            finalProposal.explanation = `Error: AI proposed a full replacement ('replace_all') but failed to provide the complete new text. Original explanation: ${finalProposal.explanation}`;
            delete finalProposal.text;
        }
        // Remove any potentially incorrect indices provided for replace_all
        delete finalProposal.startIndex;
        delete finalProposal.endIndex;
        delete (finalProposal as any).contextParagraphIndices; // Also remove this internal field

    }
    // Handle edits targeting specific context paragraphs
    else if (Array.isArray(llmProposal.contextParagraphIndices) && llmProposal.contextParagraphIndices.length > 0) {
        const targetIndices = llmProposal.contextParagraphIndices.filter(index =>
            typeof index === 'number' && index >= 0 && index < originalContextData.length
        );

        if (targetIndices.length === 0) {
            // All provided indices were invalid
            console.warn(`LLM provided invalid or out-of-bounds contextParagraphIndices: ${JSON.stringify(llmProposal.contextParagraphIndices)}. Original data length: ${originalContextData.length}.`);
            finalProposal.type = 'clarification';
            finalProposal.explanation = `Error: AI tried to edit paragraph indices that don't exist or were invalid (${JSON.stringify(llmProposal.contextParagraphIndices)}). Original explanation: ${finalProposal.explanation}`;
            delete finalProposal.text; // Clear potentially invalid fields
        } else {
            // At least one valid index provided, calculate combined range
            let minStartIndex = Infinity;
            let maxEndIndex = -1;

            targetIndices.forEach(index => {
                const contextData = originalContextData[index];
                minStartIndex = Math.min(minStartIndex, contextData.startIndex);
                maxEndIndex = Math.max(maxEndIndex, contextData.endIndex);
            });

            finalProposal.startIndex = minStartIndex;
            finalProposal.endIndex = maxEndIndex;

            // Further validation based on type for context paragraph edits
            if ((finalProposal.type === 'replace' || finalProposal.type === 'insert') && finalProposal.text === undefined) {
                 console.warn(`Context-based proposal type '${finalProposal.type}' missing required field 'text' for indices ${JSON.stringify(targetIndices)}.`);
                 finalProposal.type = 'clarification';
                 finalProposal.explanation = `Error: Proposal targeted paragraph(s) ${JSON.stringify(targetIndices)} but was missing the replacement/insertion text. Original explanation: ${finalProposal.explanation}`;
                 delete finalProposal.startIndex;
                 delete finalProposal.endIndex;
                 delete finalProposal.text;
            } else if (finalProposal.type === 'delete' && finalProposal.text !== undefined) {
                // Delete shouldn't have text
                delete finalProposal.text;
            } else if (finalProposal.type === 'insert') {
                // Insert uses startIndex, but not endIndex derived from context paragraph range
                delete finalProposal.endIndex;
                 // Use startIndex calculated above as the insertion point
            }


             // Warn if some indices were filtered out but we still proceeded
             if (targetIndices.length !== llmProposal.contextParagraphIndices.length) {
                 console.warn(`LLM provided some invalid contextParagraphIndices: ${JSON.stringify(llmProposal.contextParagraphIndices)}. Used valid indices: ${JSON.stringify(targetIndices)}.`);
                 finalProposal.explanation = `(Note: Some requested paragraph indices were invalid and ignored.) ${finalProposal.explanation}`;
             }
        }
        delete (finalProposal as any).contextParagraphIndices; // Remove internal field
    }
    // Handle edits *not* targeting specific context paragraphs (require startIndex/endIndex from LLM)
    else if (['replace', 'insert', 'delete'].includes(finalProposal.type!)) {
        const requiresText = ['replace', 'insert'].includes(finalProposal.type!);
        const requiresStartIndex = ['replace', 'insert', 'delete'].includes(finalProposal.type!);
        const requiresEndIndex = ['replace', 'delete'].includes(finalProposal.type!);

        let errorExplanation: string | null = null;

        if (requiresText && (finalProposal.text === undefined || typeof finalProposal.text !== 'string')) {
             errorExplanation = `Error: AI proposed a '${finalProposal.type}' edit outside specific context paragraphs but failed to provide the necessary text.`;
        } else if (requiresStartIndex && (llmProposal.startIndex === undefined || typeof llmProposal.startIndex !== 'number' || llmProposal.startIndex < 0)) {
             errorExplanation = `Error: AI proposed a '${finalProposal.type}' edit outside specific context paragraphs but failed to provide a valid 'startIndex'.`;
        } else if (requiresEndIndex && (llmProposal.endIndex === undefined || typeof llmProposal.endIndex !== 'number' || llmProposal.endIndex < 0)) {
             errorExplanation = `Error: AI proposed a '${finalProposal.type}' edit outside specific context paragraphs but failed to provide a valid 'endIndex'.`;
        } else if (requiresEndIndex && typeof llmProposal.startIndex === 'number' && typeof llmProposal.endIndex === 'number' && llmProposal.startIndex > llmProposal.endIndex) {
             errorExplanation = `Error: AI proposed a '${finalProposal.type}' edit with invalid indices (startIndex ${llmProposal.startIndex} > endIndex ${llmProposal.endIndex}).`;
        }

        if (errorExplanation) {
            console.warn(`${errorExplanation} Original explanation: ${finalProposal.explanation}`);
            finalProposal.type = 'clarification';
            finalProposal.explanation = `${errorExplanation} Original explanation: ${finalProposal.explanation}`;
            delete finalProposal.text;
            delete finalProposal.startIndex;
            delete finalProposal.endIndex;
        } else {
            // Assign validated fields
            if (requiresStartIndex) finalProposal.startIndex = llmProposal.startIndex;
            if (requiresEndIndex) finalProposal.endIndex = llmProposal.endIndex;
            if (!requiresText) delete finalProposal.text; // Remove text if not needed (e.g., delete)
             if (finalProposal.type === 'insert') delete finalProposal.endIndex; // Insert only uses startIndex
        }
    }
    // --- End Validation Logic ---

    // Clean up internal field just in case it slipped through (should be redundant now)
    delete (finalProposal as any).contextParagraphIndices;

    // Return the structured edit proposal
    return NextResponse.json(finalProposal);

  } catch (error: any) {
    console.error("Error in /api/chat:", error);
    // Handle potential safety blocks or other API errors
    const fallbackProposal: EditProposal = {
        type: 'clarification',
        explanation: 'An error occurred while processing the request.'
    };
    let statusCode = 500;

    if (error.message && error.message.includes('SAFETY')) {
        fallbackProposal.explanation = 'The proposed response was blocked due to safety settings.';
        statusCode = 200; // Treat safety as a valid (clarification) response
    } else if (error.message && error.message.includes("API key not valid")) {
        fallbackProposal.explanation = 'There is an issue with the server configuration. Please contact support.';
    } else {
         fallbackProposal.explanation = error.message || 'An unexpected error occurred while processing your request.';
    }

    return NextResponse.json(fallbackProposal, { status: statusCode });
  }
} 