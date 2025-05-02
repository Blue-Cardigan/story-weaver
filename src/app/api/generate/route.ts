import { GoogleGenAI, Content, Tool, GenerationConfig } from "@google/genai";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { Database } from "@/types/supabase"; // Import Database type
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

const baseGenerationConfig: CustomGenerationConfig = {
  temperature: 0.9,
  topP: 0.95,
  topK: 40,
  responseMimeType: "text/plain",
};

// Define the type for generation data more accurately based on schema
type NewGenerationPayload = Database['public']['Tables']['story_generations']['Insert'];
type DbChapter = Database['public']['Tables']['chapters']['Row']; // Add Chapter type
type Story = Database['public']['Tables']['stories']['Row']; // Add Story type

interface FetchedGeneration {
    id: string;
    prompt: string | null;
    generated_story: string | null;
    parent_generation_id: string | null;
    iteration_feedback: string | null; // Needed to reconstruct user prompts
}

// Fetches the direct parent for simple refinement context (not full chain needed here)
async function fetchParentGeneration(id: string, supabase: ReturnType<typeof createSupabaseServerClient>): Promise<FetchedGeneration | null> {
    const { data, error } = await supabase
      .from('story_generations')
      .select('id, prompt, generated_story, parent_generation_id, iteration_feedback')
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error(`Error fetching parent generation ${id}:`, error);
      return null;
    }
    return data as FetchedGeneration;
}

// Helper to fetch chapter details
async function fetchChapterDetails(id: string, supabase: ReturnType<typeof createSupabaseServerClient>): Promise<DbChapter | null> {
  const { data, error } = await supabase
    .from('chapters')
    .select('id, synopsis, chapter_number, title, style_notes, additional_notes') // Added style_notes, additional_notes
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error(`Error fetching chapter details ${id}:`, error);
    return null;
  }
  return data as DbChapter;
}

export async function POST(request: Request) {
  // const cookieStore = cookies(); // No longer need to get it here
  const supabase = createSupabaseServerClient(); // Call without arguments

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();

  try {
    const {
        // Standalone generation fields
        synopsis,
        styleNote, 
        storyId,
        chapterId,
        partInstructions,
        globalSynopsis, // Read-only context, may not be needed directly in prompt if history is good
        globalStyleNote, // Use this if available, otherwise use styleNote
        previousPartContent, // Direct context from the last part
        storyTargetLength, // New: Target length for the whole story
        currentStoryLength, 
        length, // Length requested for *this* part
        useWebSearch,
        parentId,
        refinementFeedback,
        userIdentifier, // For anonymous users
        previousContentForAnon, // Added for anonymous refinement
    } = await request.json();

    // --- Top-Level Validation ---
    // 1. User Identification
    if (!user && !userIdentifier) {
      return NextResponse.json({ error: 'Missing user identifier or authentication' }, { status: 401 });
    }
    // 2. Basic Length
    if (!length || length <= 0) {
        return NextResponse.json({ error: 'Valid length is required' }, { status: 400 });
    }

    // --- Determine Request Type & Perform Specific Validation ---
    let isBookMode = false;
    let chapterDetails: DbChapter | null = null;
    let fetchedStoryData: Story | null = null;

    const isRefinement = !!parentId || !!previousContentForAnon;

    if (isRefinement) {
        // --- Refinement Validation ---
        if (!refinementFeedback) {
            return NextResponse.json({ error: 'Missing refinementFeedback for refinement request' }, { status: 400 });
        }
        // If anonymous refinement, ensure previous content was provided
        if (!parentId && typeof previousContentForAnon !== 'string') {
            return NextResponse.json({ error: 'Missing previousContentForAnon for anonymous refinement' }, { status: 400 });
        }
        // If refining within a story, fetch story/chapter details for context
        if (storyId) {
            const { data: storyData, error: storyError } = await supabase
                .from('stories')
                .select('structure_type, global_synopsis, global_style_note, global_additional_notes')
                .eq('id', storyId)
                .maybeSingle();
            if (storyError || !storyData) {
                 console.error(`Refine: Error fetching story ${storyId} details or access denied:`, storyError);
                 return NextResponse.json({ error: 'Failed to fetch story details for refinement context or access denied' }, { status: 403 });
            }
            fetchedStoryData = storyData as Story;
            isBookMode = fetchedStoryData.structure_type === 'book';

            if (isBookMode && chapterId) { // Chapter context is optional but useful for refinement
                 chapterDetails = await fetchChapterDetails(chapterId, supabase);
                 if (!chapterDetails) {
                     console.warn(`Refine: Chapter ${chapterId} not found or access denied during refinement context fetch.`);
                     // Don't fail, just proceed without chapter context
                 }
            }
        } else {
            // Standalone refinement: styleNote is needed for context
            if (!styleNote) {
                 return NextResponse.json({ error: 'Missing styleNote for standalone refinement context' }, { status: 400 });
            }
        }

    } else if (storyId) {
        // --- Story Part Generation Validation ---
        const { data: storyData, error: storyError } = await supabase
            .from('stories')
            .select('structure_type, global_synopsis, global_style_note, global_additional_notes')
            .eq('id', storyId)
            .maybeSingle();
        if (storyError || !storyData) {
            console.error(`Generate: Error fetching story ${storyId} details or access denied:`, storyError);
            return NextResponse.json({ error: 'Failed to fetch story details or access denied' }, { status: 403 });
        }
        fetchedStoryData = storyData as Story;
        isBookMode = fetchedStoryData.structure_type === 'book';

        if (isBookMode) {
            // Book mode requires chapterId for new parts
            if (!chapterId) {
                 return NextResponse.json({ error: 'Missing chapterId for new book part generation' }, { status: 400 });
            }
            chapterDetails = await fetchChapterDetails(chapterId, supabase);
            if (!chapterDetails) {
                 return NextResponse.json({ error: `Chapter ${chapterId} not found or access denied` }, { status: 404 });
            }
        }
        // All story part generation needs instructions and style context
        if (!partInstructions) {
            return NextResponse.json({ error: 'Missing partInstructions for new story part' }, { status: 400 });
        }
        if (!styleNote && !fetchedStoryData.global_style_note) {
            return NextResponse.json({ error: 'Missing styleNote or globalStyleNote for story part' }, { status: 400 });
        }

    } else {
        // --- Standalone Initial Generation Validation ---
        if (!synopsis || !styleNote) {
            return NextResponse.json({ error: 'Missing synopsis or styleNote for standalone generation' }, { status: 400 });
        }
    }

    // --- Determine Effective Style Note (used in all cases) ---
    // Prioritize chapter, then global, then specific
    const effectiveStyleNote = chapterDetails?.style_notes || fetchedStoryData?.global_style_note || styleNote;
    if (!effectiveStyleNote && !isRefinement) {
        // Only strictly required for non-refinement if not covered by other checks, but good safeguard
        // For refinement, style might be derived from parent, but let's ensure *some* style is usually present
        // Revisit if style note is truly optional in some refinement cases.
        console.warn("No effective style note could be determined.");
        // Return NextResponse.json({ error: 'Could not determine style note for generation' }, { status: 400 });
    }

    // Create a local config for this request based on the base config
    const requestConfig: CustomGenerationConfig = { ...baseGenerationConfig };

    if (useWebSearch) {
        requestConfig.tools = [groundingTool]; // Add tools only if needed
    }      

    const historyContents: Content[] = [];
    let currentPromptText = '';
    let basePromptForDb = ''; // Store the core instruction

    if (parentId || previousContentForAnon) { // Adjusted condition: Refinement if parentId or previousContentForAnon exists
        // Refinement Logic (applies to both story and standalone)
        if (!refinementFeedback) {
            return NextResponse.json({ error: 'Missing refinementFeedback for refinement request' }, { status: 400 });
        }

        let previousContent: string | null = null;
        if (parentId) {
            // Logged-in user: Fetch parent content
        const parentGen = await fetchParentGeneration(parentId, supabase);
        if (parentGen?.generated_story) {
                previousContent = parentGen.generated_story;
            } else {
                 console.warn(`Could not fetch parent ${parentId} or it lacked content for refinement history.`);
                 // Return error? For now, we proceed without history, but this might be confusing.
                 // return NextResponse.json({ error: `Parent generation ${parentId} not found or has no content.` }, { status: 404 });
            }
        } else {
            // Anonymous user: Use provided content
            if (typeof previousContentForAnon === 'string' && previousContentForAnon.trim()) {
                 previousContent = previousContentForAnon;
            } else {
                console.warn(`Anonymous refinement requested but no previousContentForAnon provided or it was empty.`);
                // Return error as refinement needs previous content
                return NextResponse.json({ error: 'Previous content is required for anonymous refinement.' }, { status: 400 });
            }
        }

        if (previousContent) {
            historyContents.push({ role: "model", parts: [{ text: previousContent }] });
        } else {
             // This case should now be handled by the error checks above, but as a failsafe:
             return NextResponse.json({ error: 'Failed to retrieve or provide previous content for refinement.' }, { status: 400 });
        }

        basePromptForDb = refinementFeedback; // The feedback is the core instruction

        // Determine context for refinement prompt
        let refinementContext = 'Refine the previous story segment based on the following feedback.';
        const effectiveStyleNoteForRefine = chapterDetails?.style_notes || fetchedStoryData?.global_style_note || styleNote;
        refinementContext += ` Maintain the established style (Effective Style Note: ${effectiveStyleNoteForRefine}).`;
        // Add chapter context if available
        if (chapterDetails) {
            refinementContext += ` This segment is part of Chapter ${chapterDetails.chapter_number}${chapterDetails.title ? ` (\"${chapterDetails.title}\")` : ''}.`;
            if(chapterDetails.synopsis) refinementContext += ` Chapter Synopsis: ${chapterDetails.synopsis}.`;
            // Include chapter notes in refinement context too?
            if(chapterDetails.style_notes) refinementContext += ` Chapter Style Notes: ${chapterDetails.style_notes}.`;
            if(chapterDetails.additional_notes) refinementContext += ` Chapter Additional Notes: ${chapterDetails.additional_notes}.`;
        }
        // Add global context if available (and not already implicitly covered by chapter?)
        if (fetchedStoryData && !chapterDetails) { // Only add global if no chapter context provided
            if(fetchedStoryData.global_synopsis) refinementContext += ` Overall Story Synopsis: ${fetchedStoryData.global_synopsis}.`;
            if(fetchedStoryData.global_style_note) refinementContext += ` Overall Story Style Note: ${fetchedStoryData.global_style_note}.`; // Already in effectiveStyleNote but maybe useful explicitly?
            if(fetchedStoryData.global_additional_notes) refinementContext += ` Overall Story Additional Notes: ${fetchedStoryData.global_additional_notes}.`;
        }

        currentPromptText = `${refinementContext} Aim for a length of approximately ${length} words. Incorporate web search results if relevant and helpful.\n\nFeedback:\n${refinementFeedback}\n\nRefined Story Segment:`;

      } else if (storyId && isBookMode) {
        // --- Book Chapter Part Generation Logic ---
        if (!partInstructions) { /* ... */ }
        if (!chapterDetails) {
             // Should have been caught earlier, but safety check
             return NextResponse.json({ error: 'Chapter details missing for book part generation.' }, { status: 500 });
        }

        if (previousPartContent) { historyContents.push({ role: "model", parts: [{ text: previousPartContent }] }); }

        basePromptForDb = partInstructions;
        let initialContext = '';
         if (!previousPartContent) { // First part of *this chapter*
            initialContext = `You are writing Chapter ${chapterDetails.chapter_number}${chapterDetails.title ? ` ("${chapterDetails.title}")` : ''}. `;
            if (chapterDetails.synopsis) {
                initialContext += `Chapter Synopsis: ${chapterDetails.synopsis}. `;
            }
            // Add Chapter Notes if they exist
            if (chapterDetails.style_notes) {
                initialContext += `Chapter Style Notes: ${chapterDetails.style_notes}. `;
            }
            if (chapterDetails.additional_notes) {
                initialContext += `Chapter Additional Notes: ${chapterDetails.additional_notes}. `;
            }
            // Add Global context (Synopis, Style, Additional Notes)
            if (fetchedStoryData?.global_synopsis) {
                 initialContext += `Overall Story Synopsis: ${fetchedStoryData.global_synopsis}. `;
            }
            if (fetchedStoryData?.global_style_note) {
                 initialContext += `Overall Story Style Note: ${fetchedStoryData.global_style_note}. `;
            }
            if (fetchedStoryData?.global_additional_notes) {
                 initialContext += `Overall Story Additional Notes: ${fetchedStoryData.global_additional_notes}. `;
            }
            initialContext += '\n\n';
         }

        const lengthGuidance = '';
        if (typeof storyTargetLength === 'number' && storyTargetLength > 0) { /* ... add length guidance ... */ }

        currentPromptText = `${initialContext}${lengthGuidance}Continue the story within the current chapter based on the previous part (if provided). Write the next section according to these instructions, keeping the style consistent (Effective Style Note for this part: ${effectiveStyleNote}). Aim for this part to be approximately ${length} words long. Incorporate web search results if relevant.\n\nInstructions for this part:\n${partInstructions}\n\nNext Story Section (within Chapter ${chapterDetails.chapter_number}):`;

      } else if (storyId) {
        // Story Part Generation Logic
        if (!partInstructions) {
             return NextResponse.json({ error: 'Missing partInstructions for new story part' }, { status: 400 });
        }

        if (previousPartContent) { historyContents.push({ role: "model", parts: [{ text: previousPartContent }] }); }

        let initialContext = '';
        if (!previousPartContent && fetchedStoryData?.global_synopsis) {
            initialContext = `You are writing a story. Overall Synopsis: ${fetchedStoryData.global_synopsis}. `;
            // Add other global notes if synopsis exists
            if (fetchedStoryData.global_style_note) {
                 initialContext += `Overall Style Note: ${fetchedStoryData.global_style_note}. `;
            }
            if (fetchedStoryData.global_additional_notes) {
                 initialContext += `Overall Additional Notes: ${fetchedStoryData.global_additional_notes}. `;
            }
             initialContext += '\n\n';
        }

        let lengthGuidance = '';
        if (typeof storyTargetLength === 'number' && storyTargetLength > 0) {
            const currentLen = typeof currentStoryLength === 'number' ? currentStoryLength : 0;
            const percentage = Math.round((currentLen / storyTargetLength) * 100);
            lengthGuidance += `You are about ${percentage}% of the way through the story.`;
        }

        // Determine effective style (No chapter notes here)
        const effectiveStyleNoteForStoryPart = fetchedStoryData?.global_style_note || styleNote;

        currentPromptText = `${initialContext}${lengthGuidance}Continue the story based on the previous part (if provided). Write the next part according to these instructions, keeping the style consistent. Style Note: ${effectiveStyleNoteForStoryPart}. Aim for this part to be approximately ${length} words long. Incorporate web search results if relevant and helpful.\n\nInstructions for this part:\n${partInstructions}\n\nNext Story Part:`;

    } else {
      // Standalone Initial Generation Logic
       if (!synopsis) {
         return NextResponse.json({ error: 'Missing synopsis for initial generation' }, { status: 400 });
      }

       // --- Modification Start: Add previousPartContent to history for standalone continuation ---
       if (previousPartContent) {
           historyContents.push({ role: "model", parts: [{ text: previousPartContent }] });
       }
       // --- Modification End ---

       // Determine the prompt based on whether it's initial or continuation
       if (previousPartContent) {
           // Standalone Continuation Prompt
           basePromptForDb = partInstructions || 'Continue narrative'; // Use provided instructions or default
           currentPromptText = `Continue the story based on the previous part. Adhere to the original style. Aim for this segment to be approximately ${length} words. Incorporate web search results if relevant and helpful.\n\nOriginal Style Note: ${effectiveStyleNote}\nOriginal Synopsis: ${synopsis}\n\nInstructions for this part:\n${partInstructions || 'Continue the narrative naturally from the previous part.'}\n\nNext Story Segment:`;
       } else {
           // Standalone Initial Generation Prompt
           basePromptForDb = synopsis; // The synopsis is the core prompt for initial
           currentPromptText = `Flesh out the following synopsis into a story segment of approximately ${length} words. Adhere to the specified style. Incorporate web search results if relevant and helpful.\n\nStyle Note: ${effectiveStyleNote}\n\nSynopsis:\n${synopsis}\n\nStory Segment:`;
       }
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

    // --- Prepare data for Supabase insert ---
    const generationData: Partial<NewGenerationPayload> = {
      story_id: storyId || null, // Include storyId if provided
      // Store synopsis/instructions only for *initial* generations (not refinements)
      synopsis: !parentId && !previousContentForAnon && !storyId ? synopsis : null,
      part_instructions: !parentId && !previousContentForAnon && storyId && !chapterId ? partInstructions : null, // Only for initial non-book part
      chapter_id: chapterId || null, // Always store chapterId if provided
      global_context_synopsis: storyId ? (fetchedStoryData?.global_synopsis || null) : null, // Store context used
      global_context_style: storyId ? (fetchedStoryData?.global_style_note || null) : null, // Store context used
      style_note: effectiveStyleNote || null, // Store the effective style note used
      requested_length: parseInt(length, 10),
      use_web_search: !!useWebSearch,
      prompt: basePromptForDb, // Store the core user instruction (synopsis/instructions/feedback)
      generated_story: generatedText,
      parent_generation_id: parentId || null, // Only set if logged in refinement
      iteration_feedback: refinementFeedback || null, // Store refinement feedback if provided
      // Save length context provided to the model
      context_target_length: typeof storyTargetLength === 'number' ? storyTargetLength : null,
      context_current_length: typeof currentStoryLength === 'number' ? currentStoryLength : null,
      // is_accepted will be set by the /api/accept endpoint
    };

    // Add user_id if logged in, otherwise add user_identifier
    if (user) {
      generationData.user_id = user.id;
    } else {
      generationData.user_identifier = userIdentifier;
    }

    // --- Save to Supabase ONLY if logged in, otherwise just return the generation ---
    let savedGenerationId: string | null = null;

    if (user) {
    const { data: insertData, error: supabaseError } = await supabase
      .from('story_generations')
      .insert(generationData as NewGenerationPayload) // Use correct type
      .select('id')
      .single();

    if (supabaseError || !insertData) {
      // Enhanced Supabase error logging
      console.error('Supabase insert error object:', supabaseError);
      console.error('Supabase insert error details:', JSON.stringify(supabaseError, null, 2)); 
      return NextResponse.json({ error: `Failed to save generation record. ${supabaseError?.message || 'Unknown Supabase error'}` }, { status: 500 });
    }
        savedGenerationId = insertData.id;
    } else {
        console.log("Anonymous user generation - skipping database save.");
        // Optionally: Add logic here if the server *needed* to do something
        // specific for anonymous users besides just returning the content.
    }

    // Return story, ID (if saved), and grounding metadata
    return NextResponse.json({ 
        story: generatedText, 
        generationId: savedGenerationId, // Will be null for anonymous users
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
