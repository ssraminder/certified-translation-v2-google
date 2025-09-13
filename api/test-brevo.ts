// This is a serverless function.
// File path: /api/test-brevo.ts

import * as SibApiV3Sdk from '@getbrevo/brevo';
// import type { Request, Response } from 'express';
// Fix: Use Node.js http types and define a custom interface for Express-like compatibility.
import type { IncomingMessage, ServerResponse } from 'http';

interface ApiResponse extends ServerResponse {
  status(code: number): this;
  json(data: any): this;
}

export default async function handler(req: IncomingMessage, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { BREVO_API_KEY, TEST_EMAIL_RECIPIENT, TEST_EMAIL_SENDER } = process.env;

  if (!BREVO_API_KEY || !TEST_EMAIL_RECIPIENT || !TEST_EMAIL_SENDER) {
    return res.status(500).json({
      success: false,
      error: 'BREVO_API_KEY, TEST_EMAIL_RECIPIENT, or TEST_EMAIL_SENDER is not configured in environment variables.',
    });
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

    return res.status(200).json({
      success: true,
      data: {
        message: 'Successfully sent test email via Brevo API.',
        result: data.body,
      },
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: `Brevo API error: ${error.message}`,
    });
  }
}
