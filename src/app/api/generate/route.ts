import { GoogleGenAI, Content, Tool, GenerationConfig } from "@google/genai";
import { supabase } from "@/lib/supabaseClient";
import { NextResponse } from 'next/server';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set");
}
// Corrected instantiation
const genAI = new GoogleGenAI({ apiKey: apiKey });

// Corrected grounding tool definition based on documentation
const groundingTool: Tool = {
  googleSearch: {},
};

// Define the type for generationConfig explicitly
interface CustomGenerationConfig extends GenerationConfig {
    tools?: Tool[];
}

const generationConfig: CustomGenerationConfig = {
  temperature: 0.9,
  topP: 0.95,
  topK: 40,
  responseMimeType: "text/plain",
  // tools property removed from here, will be added conditionally later
};

// Helper type for Supabase fetch
interface FetchedGeneration {
    id: string;
    prompt: string | null;
    generated_story: string | null;
    parent_generation_id: string | null;
    iteration_feedback: string | null; // Needed to reconstruct user prompts
}

// Function to fetch full generation chain recursively
async function fetchGenerationChain(id: string): Promise<FetchedGeneration[]> {
    const { data, error } = await supabase
      .from('story_generations')
      .select('id, prompt, generated_story, parent_generation_id, iteration_feedback')
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error(`Error fetching generation ${id} for history:`, error);
      return []; // Return empty if error or not found
    }

    const currentGen = data as FetchedGeneration;
    if (currentGen.parent_generation_id) {
        const parentChain = await fetchGenerationChain(currentGen.parent_generation_id);
        return [...parentChain, currentGen]; // Append current to parent chain
    } else {
        return [currentGen]; // Base case: initial generation
    }
}


export async function POST(request: Request) {
  try {
    const { synopsis, styleNote, length, useWebSearch, parentId, refinementFeedback } = await request.json();

    if (!styleNote || !length || (!synopsis && !parentId)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create a local config for this request based on the base config
    const requestConfig: CustomGenerationConfig = { ...generationConfig };

    if (useWebSearch) {
        requestConfig.tools = [groundingTool]; // Add tools only if needed
    }      

    const historyContents: Content[] = [];
    let currentPromptText = '';

    if (parentId) {
      if (!refinementFeedback) {
        return NextResponse.json({ error: 'Missing refinementFeedback for refinement request' }, { status: 400 });
      }
      const fullChain = await fetchGenerationChain(parentId);
      if (fullChain.length === 0) {
        console.warn(`Could not fetch history for parentId ${parentId}. Proceeding without history.`);
      } else {
        fullChain.forEach((gen, index) => {
          let userPromptText: string | null = null;
          if (index === 0) {
              userPromptText = gen.prompt;
          } else {
              userPromptText = `Refine the previous story segment based on the following feedback: ${gen.iteration_feedback}`;
          }
          if (userPromptText && gen.generated_story) {
              historyContents.push({ role: "user", parts: [{ text: userPromptText }] });
              historyContents.push({ role: "model", parts: [{ text: gen.generated_story }] });
          }
        });
      }
       currentPromptText = `Refine the previous story segment based on the following feedback. Incorporate web search results if relevant. Keep the style similar (Style Note: ${styleNote}) and aim for length ~${length} words.\n\nFeedback: ${refinementFeedback}\n\nRefined Story Segment:`;

    } else {
      if (!synopsis) {
         return NextResponse.json({ error: 'Missing synopsis for initial generation' }, { status: 400 });
      }
      currentPromptText = `Flesh out the following synopsis section into a story segment of approximately ${length} words. Incorporate web search results if relevant.\n\nStyle Note: ${styleNote}\n\nSynopsis Section:\n${synopsis}\n\nStory Segment:`;
    }

    const contents: Content[] = [
        ...historyContents,
        { role: "user", parts: [{ text: currentPromptText }] }
    ];

    // Define the request object (type inferred)
    const generateRequest = {
        contents: contents,
        config: requestConfig, // Use the request-specific config
    };

    const result = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        ...generateRequest
    });

    if (
        !result ||
        !result.candidates ||
        result.candidates.length === 0 ||
        !result.candidates[0].content ||
        !result.candidates[0].content.parts ||
        result.candidates[0].content.parts.length === 0
    ) {
        console.error("Invalid response structure from Gemini API:", JSON.stringify(result, null, 2));
        throw new Error("Failed to parse response from AI model.");
    }
    // Concatenate text from all parts
    const generatedText = result.candidates[0].content.parts
        .map(part => part.text)
        .join("") || "";

    // Extract grounding metadata if available
    let groundingMetadata = null;
    if (result.candidates[0].groundingMetadata && result.candidates[0].groundingMetadata.searchEntryPoint) {
      console.log("Used web search");
      groundingMetadata = {
        // Only include searchEntryPoint if it exists
        searchEntryPoint: result.candidates[0].groundingMetadata.searchEntryPoint,
        // Extract grounding chunks and supports if they exist
        groundingChunks: result.candidates[0].groundingMetadata.groundingChunks || [],
        groundingSupports: result.candidates[0].groundingMetadata.groundingSupports || [],
        webSearchQueries: result.candidates[0].groundingMetadata.webSearchQueries || [],
      };
    } else {
        console.log("No grounding metadata or searchEntryPoint found.");
    }

    // --- Save to Supabase --- 
    const { data: insertData, error: supabaseError } = await supabase
      .from('story_generations')
      .insert([
        {
          synopsis: parentId ? null : synopsis,
          style_note: styleNote,
          requested_length: parseInt(length, 10),
          use_web_search: !!useWebSearch,
          prompt: currentPromptText,
          generated_story: generatedText,
          parent_generation_id: parentId,
          iteration_feedback: refinementFeedback
        },
      ])
      .select('id')
      .single();

    if (supabaseError || !insertData) {
      // Enhanced Supabase error logging
      console.error('Supabase insert error object:', supabaseError);
      console.error('Supabase insert error details:', JSON.stringify(supabaseError, null, 2)); 
      return NextResponse.json({ error: `Failed to save generation record. ${supabaseError?.message || 'Unknown Supabase error'}` }, { status: 500 });
    }

    // Return story, ID, and grounding metadata
    return NextResponse.json({ 
        story: generatedText, 
        generationId: insertData.id,
        groundingMetadata: groundingMetadata // Include metadata in response
    });

  } catch (error: any) {
    // Enhanced general error logging
    console.error("Error details in /api/generate catch block:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);

    if (error.message && error.message.includes('SAFETY')) {
        return NextResponse.json({ error: 'Content generation blocked due to safety settings.' }, { status: 400 });
    }
    // Check for function calling errors if you add function calling later
    // if (error.message && error.message.includes('FUNCTION_CALL')) { ... }
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
