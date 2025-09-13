import { ApiName, ApiResponse } from '../types';

/**
 * Performs a POST request to a backend endpoint to test an API integration.
 * @param apiName The name of the API to test.
 * @returns A promise that resolves to an ApiResponse object.
 */
const testApi = async (apiName: ApiName): Promise<ApiResponse> => {
    try {
        // Converts an API name like "Google Cloud Vision" to a URL-friendly slug "google-cloud-vision"
        const endpoint = `/api/test-${apiName.toLowerCase().replace(/ /g, '-')}`;
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `Request failed with status ${response.status}`;
            
            // If the server returns an HTML page (e.g., for a 404), it indicates a missing backend endpoint.
            if (errorText.trim().toLowerCase().startsWith('<!doctype html')) {
                errorMessage = `API endpoint not found at '${endpoint}'. Please ensure backend functions are deployed correctly.`;
            } else {
                 // Otherwise, try to parse a JSON error from the backend, or use the raw text.
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.error || errorMessage;
                } catch {
                    errorMessage = errorText || errorMessage;
                }
            }
            throw new Error(errorMessage);
        }

        // The backend should return a JSON response on success.
        const result = await response.json();
        return result;

    } catch (error) {
        // Catches network errors (e.g., failed to fetch) and errors thrown from the response check.
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
};

export const testSupabase = () => testApi('Supabase');
export const testGemini = () => testApi('Gemini');
export const testGoogleCloudVision = () => testApi('Google Cloud Vision');
export const testStripe = () => testApi('Stripe');
export const testBrevo = () => testApi('Brevo');