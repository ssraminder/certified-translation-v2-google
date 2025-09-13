# API Integration Test Dashboard

This project is a full-stack application designed to test various API integrations. It consists of a React frontend and a set of Node.js serverless functions for the backend, intended for easy deployment on platforms like the Digital Ocean App Platform.

## Project Structure

The repository is structured to contain both the frontend and backend code in a single unit.

### Frontend (`/` root)

-   **Framework:** React with Vite
-   **Language:** TypeScript
-   **Source Files:** All frontend components, services, and assets are located in the root and `/src` directory (implicitly, with `index.tsx`).
-   **Functionality:** Provides the user interface for triggering API tests and viewing their results. It makes HTTP requests to the backend functions.

### Backend (`/api` directory)

-   **Runtime:** Node.js Serverless Functions
-   **Language:** TypeScript
-   **Source Files:** Each `.ts` file inside the `/api` directory corresponds to a single serverless API endpoint.
    -   `/api/test-supabase.ts` handles the Supabase connection test.
    -   `/api/test-gemini.ts` handles the Gemini API test.
    -   `/api/generate-story.ts` handles the streaming story generation with Gemini.
    -   And so on for Stripe, Brevo, and Google Cloud Vision.
-   **Functionality:** Each function securely communicates with a specific third-party API using the environment variables configured on the deployment platform. They handle the core logic and prevent API keys from being exposed in the browser.

## Deployment

This application is configured for deployment on the **Digital Ocean App Platform**.

1.  **Connect Your Repository:** Point your Digital Ocean App to this repository.
2.  **Auto-Detection:** Digital Ocean will automatically detect the Vite frontend (as a "web service") and the serverless functions in the `/api` directory.
3.  **Configure Environment Variables:** Follow the instructions in `DIGITAL_OCEAN_SETUP.md` to add all the necessary API keys and secrets. This is a critical step for the backend functions to work.

Once deployed, the frontend will be served as a static site, and the `/api` endpoints will be live and ready to receive requests.
