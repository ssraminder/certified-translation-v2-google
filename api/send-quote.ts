// DO NOT EDIT OUTSIDE THIS BLOCK
import * as SibApiV3Sdk from '@getbrevo/brevo';
import type { IncomingMessage, ServerResponse } from 'http';

interface ApiResponse extends ServerResponse {
  status(code: number): this;
  json(data: any): this;
}

export default async function handler(req: IncomingMessage, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.TEST_EMAIL_SENDER;
  if (!apiKey || !senderEmail) {
    return res.status(500).json({ success: false, error: 'Missing Brevo configuration' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  await new Promise(resolve => req.on('end', resolve));

  let payload: any = {};
  try {
    payload = JSON.parse(body || '{}');
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON' });
  }

  const { name, email, phone, intendedUse, sourceLanguage, targetLanguage, rate, billablePages, total, files } = payload;

  try {
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKey);

    const rows = Array.isArray(files)
      ? files.map((f: any) => `<tr><td>${f.name}</td><td>${f.pages}</td><td>$${rate}</td><td>$${(f.pages * rate).toFixed(2)}</td></tr>`).join('')
      : '';

    const html = `<html><body><h1>Quote Review</h1><p>Name: ${name}<br/>Phone: ${phone}<br/>Intended Use: ${intendedUse}<br/>Source: ${sourceLanguage} -> Target: ${targetLanguage}</p><table border="1" cellpadding="5" cellspacing="0"><thead><tr><th>Filename</th><th>Billable Pages (total)</th><th>Rate</th><th>Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Total Billable Pages</td><td>${billablePages}</td><td></td><td>$${total}</td></tr></tfoot></table></body></html>`;

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = 'Your Translation Quote';
    sendSmtpEmail.htmlContent = html;
    sendSmtpEmail.sender = { name: 'Quote Bot', email: senderEmail };
    sendSmtpEmail.to = [{ email, name }];

    await apiInstance.sendTransacEmail(sendSmtpEmail);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: `Brevo API error: ${error.message}` });
  }
}
// DO NOT EDIT OUTSIDE THIS BLOCK

