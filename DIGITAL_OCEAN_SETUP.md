# Digital Ocean App Platform: Environment Variable Setup

This guide explains how to configure your API keys and other secrets as environment variables for deployment on the Digital Ocean App Platform.

## Project Structure

This is a full-stack application.
- **Frontend:** The React application is in the root of the project and will be deployed as a "Web Service" component.
- **Backend:** The backend consists of serverless functions located in the `/api` directory. Digital Ocean will automatically detect and deploy these as a "Functions" component.

The backend functions require the environment variables listed below to communicate with third-party services.

## Configuration Steps

1.  **Navigate to your App:**
    *   Log in to your Digital Ocean account.
    *   Go to the "Apps" section and select the app you've deployed.

2.  **Open Settings:**
    *   Click on the "Settings" tab for your app.

3.  **Find the Component and Edit Environment Variables:**
    *   Scroll down to the "Components" section. You will have a "web" service for the React frontend and a "functions" component for your backend APIs.
    *   Click the **functions** component to go to its settings.
    *   Find the "Environment Variables" section and click "Edit".

4.  **Add Environment Variables:**
    *   Click "Add Variable" for each key-value pair.
    *   **IMPORTANT:** Check the "Encrypt" box for each variable to ensure it's stored securely.
    *   Add the following variables with their corresponding values from your service provider dashboards:

    | Variable Name                       | Description                                                                                              | Example Value                  |
    | ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------ |
    | `SUPABASE_URL`                      | The project URL from your Supabase dashboard (Settings > API).                                           | `https://xyz.supabase.co`      |
    | `SUPABASE_ANON_KEY`                 | The public anonymous key from your Supabase dashboard (Settings > API).                                  | `ey...`                        |
    | `GEMINI_API_KEY`                    | Your API key from Google AI Studio.                                                                      | `AIza...`                      |
    | `STRIPE_SECRET_KEY`                 | Your Stripe secret key (use a test key for development/staging).                                         | `sk_test_...`                  |
    | `BREVO_API_KEY`                     | Your API v3 key from the Brevo dashboard (SMTP & API section).                                           | `xkeysib...`                   |
    | `TEST_EMAIL_RECIPIENT`              | The email address where the Brevo test email will be sent.                                               | `your-email@example.com`       |
    | `TEST_EMAIL_SENDER`                 | An authenticated sender email address in your Brevo account.                                             | `noreply@yourdomain.com`       |
    | `GOOGLE_APPLICATION_CREDENTIALS`    | **(For Google Cloud Vision)** The content of your service account JSON file. Paste the entire JSON here. | `{"type": "service_account",...}` |

5.  **Save and Redeploy:**
    *   After adding all the variables, click "Save".
    *   Digital Ocean will automatically trigger a new deployment to apply the environment variable changes. Wait for the deployment to complete.

Your backend functions will now have access to these keys via `process.env.VARIABLE_NAME`.
