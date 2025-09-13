/**
 * Generates a story by calling a secure backend endpoint that streams the response from the Gemini API.
 * @param prompt The story prompt provided by the user.
 * @returns An async iterable that yields story chunks.
 */
export async function* generateStoryStream(prompt: string): AsyncGenerator<string> {
  try {
    const response = await fetch('/api/generate-story', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      let errorMessage = `Failed to generate story. Server responded with status ${response.status}.`;
       // If the server returns an HTML page (e.g., for a 404), it indicates a missing backend endpoint.
      if (errorText.trim().toLowerCase().startsWith('<!doctype html')) {
          errorMessage = `Story generation endpoint not found at '/api/generate-story'. Please ensure backend functions are deployed correctly.`;
      } else {
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorMessage;
          } catch {
            // Not a JSON error, use the raw text.
            errorMessage = errorText || errorMessage;
          }
      }
      throw new Error(errorMessage);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      yield decoder.decode(value, { stream: true });
    }

  } catch (error) {
    console.error("Error generating story:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred while contacting the story generation API.";
    throw new Error(message);
  }
}
