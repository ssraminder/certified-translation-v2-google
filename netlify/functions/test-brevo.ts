// This is a serverless function.
// File path: /netlify/functions/test-brevo.ts

import { Handler } from '@netlify/functions';
import * as SibApiV3Sdk from '@getbrevo/brevo';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: `Method ${event.httpMethod} not allowed. Use GET or POST.` })
    };
  }

  const { BREVO_API_KEY, TEST_EMAIL_RECIPIENT, TEST_EMAIL_SENDER } = process.env;

  if (!BREVO_API_KEY || !TEST_EMAIL_RECIPIENT || !TEST_EMAIL_SENDER) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'BREVO_API_KEY, TEST_EMAIL_RECIPIENT, or TEST_EMAIL_SENDER is not configured in environment variables.',
      }),
    };
  }

  try {
    let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, BREVO_API_KEY);

    let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail(); 

    sendSmtpEmail.subject = "Brevo API Test Email";
    sendSmtpEmail.htmlContent = "<html><body><h1>This is a test email</h1><p>Your Brevo API integration is working correctly.</p></body></html>";
    sendSmtpEmail.sender = { "name": "API Test", "email": TEST_EMAIL_SENDER };
    sendSmtpEmail.to = [
      { "email": TEST_EMAIL_RECIPIENT, "name": "Test Recipient" }
    ];

    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          message: 'Successfully sent test email via Brevo API.',
          result: data.body,
        },
      }),
    };

  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: `Brevo API error: ${error.message}`,
      }),
    };
  }
};