// Using a dynamic import for the Google AI client. This prevents the application
// from crashing on load if the SDK has top-level code that causes issues.
// The SDK will only be loaded when the user first tries to generate a story.
let ai: any = null;

async function getClient() {
  // If the client is already initialized, return it.
  if (ai) {
    return ai;
  }
  
  // Dynamically import the library ONLY when it's first needed.
  const { GoogleGenAI } = await import('@google/genai');

  // Safely access the API key from the environment.
  const apiKey = (window as any).process?.env?.API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key is not configured. Please set the API_KEY environment variable.");
  }
  
  // Initialize and cache the client for subsequent calls.
  ai = new GoogleGenAI({ apiKey });
  return ai;
}

/**
 * Generates a story from a prompt using the Gemini API and streams the response.
 * @param prompt The story prompt provided by the user.
 * @returns An async iterable that yields story chunks.
 */
export async function* generateStoryStream(prompt: string): AsyncGenerator<string> {
  try {
    const client = await getClient();
    const stream = await client.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: `Write a short story about: ${prompt}`,
    });

    for await (const chunk of stream) {
        // The .text accessor on the response chunk safely extracts the text content.
        yield chunk.text;
    }
  } catch (error) {
    console.error("Error generating story:", error);
    // Re-throw the error so it can be caught by the UI component and displayed to the user.
    const message = error instanceof Error ? error.message : "An unknown error occurred while contacting the Gemini API.";
    throw new Error(message);
  }
}
