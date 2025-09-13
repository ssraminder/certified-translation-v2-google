# Netlify: Environment Variable Setup

This guide explains how to configure your API keys and other secrets as environment variables for deployment on Netlify.

## Project Structure

This is a full-stack application.
- **Frontend:** The React application is in the root of the project and will be deployed as a static site.
- **Backend:** The backend consists of serverless functions located in the `netlify/functions` directory. Netlify automatically discovers and deploys any files in this directory.

The backend functions require the environment variables listed below to communicate with third-party services.

## Configuration Steps

1. **Navigate to your Site:**
   * Log in to your Netlify account.
   * Go to the "Sites" section and select the site you've deployed from this repository.

2. **Go to Site Configuration:**
   * From your site's overview page, click on "Site configuration".

3. **Find Environment Variables:**
   * In the sidebar, navigate to "Environment variables".

4. **Add Environment Variables:**
   * Click "Add a variable" and select "Create a new variable".
   * Add each key-value pair one by one. For sensitive keys, it's highly recommended to use Netlify's "Secret" value type, although standard variables also work.
   * Add the following variables with their corresponding values from your service provider dashboards:

   | Variable Name               | Description                                                                 | Example Value             |
   | --------------------------- | --------------------------------------------------------------------------- | ------------------------ |
   | `SUPABASE_URL`              | The project URL from your Supabase dashboard (Settings > API).             | `https://xyz.supabase.co` |
   | `SUPABASE_ANON_KEY`         | The public anonymous key from your Supabase dashboard (Settings > API).    | `ey...`                  |
   | `NEXT_PUBLIC_SUPABASE_URL`  | Public URL for the landing page to query Supabase directly.                | `https://xyz.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key for client-side Supabase access.                      | `ey...`                  |
   | `GEMINI_API_KEY`            | Your API key from Google AI Studio (used for Gemini and Google Cloud Vision). | `AIza...`               |
   | `STRIPE_SECRET_KEY`         | Your Stripe secret key (use a test key for development/staging).           | `sk_test_...`           |
   | `STRIPE_API_VERSION`        | Optional Stripe API version. Defaults to `2022-11-15` when not set.         | `2022-11-15`            |
   | `BREVO_API_KEY`             | Your API v3 key from the Brevo dashboard (SMTP & API section).             | `xkeysib...`            |
   | `TEST_EMAIL_RECIPIENT`      | The email address where the Brevo test email will be sent.                 | `your-email@example.com` |
   | `TEST_EMAIL_SENDER`         | An authenticated sender email address in your Brevo account.               | `noreply@yourdomain.com` |

5. **Redeploy:**
   * After adding all the variables, you'll need to trigger a new deployment for the changes to take effect.
   * Go to the "Deploys" tab for your site.
   * Click the "Trigger deploy" dropdown and select "Deploy site".

Your backend functions will now have access to these keys via `process.env.VARIABLE_NAME`.
