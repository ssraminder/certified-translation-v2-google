
# Digital Ocean App Platform: Environment Variable Setup

To run this application and its backend functions in production on Digital Ocean, you must configure your API keys and other secrets as environment variables. **Never hardcode secrets in your code.**

Follow these steps to add your environment variables in the Digital Ocean App Platform dashboard:

1.  **Navigate to your App:**
    *   Log in to your Digital Ocean account.
    *   Go to the "Apps" section and select the app you've deployed.

2.  **Open Settings:**
    *   Click on the "Settings" tab for your app.

3.  **Find the Component and Edit Environment Variables:**
    *   Scroll down to the "Components" section. You will likely have a "web" service for the React frontend and separate "functions" for your backend APIs.
    *   For each component that needs secrets (your functions), click its name to go to its settings.
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
