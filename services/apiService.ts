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
        
        // Try to parse the JSON body, regardless of the response status.
        // This ensures we can get error details from the body of a 4xx/5xx response.
        const result = await response.json();

        if (!response.ok) {
            // If the backend provided a specific error message, use it. Otherwise, create a generic one.
            throw new Error(result.error || `Request failed with status ${response.status}`);
        }

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
