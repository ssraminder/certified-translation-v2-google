# API Integration Test Dashboard

This project is a full-stack application designed to test various API integrations. It consists of a React frontend and a set of Node.js serverless functions for the backend, intended for easy deployment on platforms like Netlify.

## Project Structure

The repository is structured to contain both the frontend and backend code in a single unit.

### Frontend (`/` root)

-   **Framework:** React with Vite
-   **Language:** TypeScript
-   **Source Files:** All frontend components, services, and assets are located in the root directory.
-   **Functionality:** Provides the user interface for triggering API tests and viewing their results. It makes HTTP requests to the backend functions via a proxy rule defined in `netlify.toml`.

### Backend (`/netlify/functions` directory)

-   **Runtime:** Netlify Functions (Node.js)
-   **Language:** TypeScript
-   **Source Files:** Each `.ts` file inside the `/netlify/functions` directory corresponds to a single serverless API endpoint.
    -   `/netlify/functions/test-supabase.ts` handles the Supabase connection test.
    -   `/netlify/functions/test-gemini.ts` handles the Gemini API test.
    -   `/netlify/functions/generate-story.ts` handles the streaming story generation with Gemini.
    -   And so on for Stripe, Brevo, and Google Cloud Vision.
-   **Functionality:** Each function securely communicates with a specific third-party API using the environment variables configured on the deployment platform. They handle the core logic and prevent API keys from being exposed in the browser.

## Deployment

This application is configured for deployment on **Netlify**.

1.  **Connect Your Repository:** Point your Netlify site to this repository.
2.  **Build Settings:** Netlify will automatically detect the build settings from `netlify.toml`.
3.  **Configure Environment Variables:** Follow the instructions in `NETLIFY_SETUP.md` to add all the necessary API keys and secrets. This is a critical step for the backend functions to work.

Once deployed, the frontend will be served as a static site, and the `/api` endpoints (proxied to your functions) will be live and ready to receive requests.