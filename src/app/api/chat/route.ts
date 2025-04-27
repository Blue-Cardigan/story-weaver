import { GoogleGenAI, Content, GenerationConfig, Part } from "@google/genai";
import { NextResponse } from 'next/server';

// Define the structure we expect the AI to return for edits
interface EditProposal {
  type: 'replace' | 'insert' | 'delete' | 'clarification' | 'none';
  explanation: string; // AI's explanation of the change or why it needs clarification
  startIndex?: number; // For replace/delete
  endIndex?: number; // For replace/delete
  text?: string; // For replace/insert
}

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
// const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Linter error here

// --- Generation Configuration ---
const generationConfig: GenerationConfig = {
  temperature: 0.3, // Lower temperature for more predictable JSON output
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 2048, // Adjust as needed
  responseMimeType: "application/json", // Request JSON output explicitly
};

// --- Helper Function to Create System Instruction ---
// This function now just returns the instruction text content, not a full Content object
function getSystemInstructionText(storyContext: string, selections: string[]): string {
    let selectionText = "";
    if (selections && selections.length > 0) {
        // Simple formatting for selections
        selectionText = `\nThe user highlighted:\n${selections.map(s => `- "${s}"`).join("\n")}`;
    }

    // Instructions for the AI
    const instructions = `You are an expert writing assistant. Analyze the user's request regarding the provided story segment and propose an edit.${selectionText}

IMPORTANT: Respond ONLY with a valid JSON object. Do NOT include any text outside this JSON object.
The JSON object must have the following fields:
- "type": (string) One of "replace", "insert", "delete", "clarification", "none".
- "explanation": (string) Your reasoning or clarifying questions.
- "startIndex": (number, optional) Required for 'replace'/'delete'. Start character index.
- "endIndex": (number, optional) Required for 'replace'/'delete'. End character index (exclusive).
- "text": (string, optional) Required for 'replace'/'insert'. The new text.

Guidelines:
- Calculate indices based on the 'Story Context' below.
- Use "clarification" if the request is ambiguous.
- Use "none" if no change is needed.

Story Context:
--- START STORY CONTEXT ---
${storyContext}
--- END STORY CONTEXT ---
`;
    return instructions;
}

// --- POST Handler ---
export async function POST(request: Request) {
  try {
    const { messages, currentStory, userRequest, selections } = await request.json();

    // Basic validation
    if (!Array.isArray(messages) || !currentStory || !userRequest) {
      return NextResponse.json({ error: 'Missing required fields: messages, currentStory, userRequest' }, { status: 400 });
    }

    // Get the system instruction text
    const systemInstructionText = getSystemInstructionText(currentStory, selections || []);

    // Construct the contents array (without system instruction)
    const contents: Content[] = [...messages, { role: "user", parts: [{ text: userRequest }] }];

    // Prepare the request config, including the system instruction
    const requestConfig = {
        ...generationConfig, // Base config
        systemInstruction: { // Add system instruction here
            parts: [{ text: systemInstructionText }]
        }
    };

    // Make the API call using genAI.models.generateContent
    const result = await genAI.models.generateContent({ 
        model: "gemini-2.0-flash", 
        contents: contents, 
        config: requestConfig // Pass the config with system instruction
    });

    // --- Process Response (Using result.candidates based on models.generateContent usage) ---
    if (
      !result ||
      !result.candidates ||
      result.candidates.length === 0 ||
      !result.candidates[0].content ||
      !result.candidates[0].content.parts ||
      result.candidates[0].content.parts.length === 0 ||
      !result.candidates[0].content.parts[0].text
    ) {
      console.error("Invalid response structure from Gemini API:", JSON.stringify(result, null, 2)); // Log the whole result
      throw new Error("Received an invalid or empty response from the AI model.");
    }

    const rawResponseText = result.candidates[0].content.parts[0].text;
    console.log("Raw AI Response:", rawResponseText); // Log raw response for debugging

    // Attempt to parse the JSON response
    let structuredEdit: EditProposal;
    try {
      // Clean potential markdown fences
      const cleanedJsonString = rawResponseText.replace(/^```json\\s*|```$/g, '').trim();
      structuredEdit = JSON.parse(cleanedJsonString);
      // Basic validation of the parsed structure
      if (!structuredEdit.type || !structuredEdit.explanation) {
        throw new Error("Parsed JSON missing required fields 'type' or 'explanation'.");
      }
      // Further validation based on type
      if ((structuredEdit.type === 'replace' || structuredEdit.type === 'delete') && (structuredEdit.startIndex === undefined || structuredEdit.endIndex === undefined)) {
        throw new Error(`Parsed JSON type '${structuredEdit.type}' missing required fields 'startIndex' or 'endIndex'.`);
      }
      if ((structuredEdit.type === 'replace' || structuredEdit.type === 'insert') && structuredEdit.text === undefined) {
        throw new Error(`Parsed JSON type '${structuredEdit.type}' missing required field 'text'.`);
      }
    } catch (parseError: any) {
      console.error("Failed to parse AI response as JSON:", parseError);
      console.error("Raw text that failed parsing:", rawResponseText);
      // Fallback: return the raw text as a clarification request
      structuredEdit = {
          type: "clarification",
          explanation: `I couldn\'t structure the response correctly. Here\'s the raw suggestion: ${rawResponseText}`
      }; // Assign fallback here
    } // Close the try...catch block correctly

    // Return the structured edit proposal
    return NextResponse.json(structuredEdit);

  } catch (error: any) {
    console.error("Error in /api/chat:", error);
    // Handle potential safety blocks or other API errors
    if (error.message && error.message.includes('SAFETY')) {
      return NextResponse.json({ type: 'clarification', explanation: 'The proposed response was blocked due to safety settings.' } as EditProposal, { status: 200 }); // Return structured error
    }
     // Handle specific error types if needed, e.g., API key issues
     if (error.message.includes("API key not valid")) {
       return NextResponse.json({ type: 'clarification', explanation: 'There is an issue with the server configuration. Please contact support.' } as EditProposal, { status: 500 }); // Internal error, but structured response
     }

    // Generic internal server error, but return structured clarification
    return NextResponse.json({ type: 'clarification', explanation: error.message || 'An unexpected error occurred while processing your request.' } as EditProposal, { status: 500 });
  }
} 