const nodemailer = require('nodemailer');
const { getSubscriberEmails, hasSubscription } = require('./subscriptions');

function getTransporter() {
  const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing SMTP configuration: ${missing.join(', ')}`);
  if (/example\.com|your-smtp|change-me/i.test(process.env.SMTP_HOST)) {
    throw new Error('SMTP_HOST is still a placeholder. Set it to your email provider, for example smtp.gmail.com.');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST.trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER.trim(),
      pass: process.env.SMTP_PASSWORD.replace(/\s/g, '')
    }
  });
}

function formatMenuText(menu, checkedAt, timezone) {
  const date = new Date(checkedAt).toLocaleDateString('en-US', { timeZone: timezone, year: 'numeric', month: 'long', day: 'numeric' });
  const time = new Date(checkedAt).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' });
  const items = menu.items.length
    ? menu.items.map((item) => `- ${item.name}${item.description ? `: ${item.description}` : ''}`).join('\n')
    : '- No menu items were found.';

  return `Hello,\n\nHere is what is being served at The Grill 42 at Teraanga Commons Dining Hall.\n\nDate: ${date}\nTime: ${time}\n\nThe Grill 42:\n\n${items}\n\nSource:\n${menu.source}\n\nEnjoy your meal!`;
}

async function sendToRecipient(recipient, menu, checkedAt) {
  const timezone = process.env.TIMEZONE || 'America/Toronto';
  const localDate = new Date(checkedAt).toLocaleDateString('en-US', { timeZone: timezone, year: 'numeric', month: 'long', day: 'numeric' });
  const localTime = new Date(checkedAt).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' });

  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: recipient,
      subject: `Grill 42 Menu — ${localDate}, ${localTime}`,
      text: formatMenuText(menu, checkedAt, timezone)
    });
  } catch (error) {
    if (error.responseCode === 535) {
      throw new Error('Gmail rejected the SMTP login. Use the Gmail address as SMTP_USER and a current 16-character Google App Password as SMTP_PASSWORD, without spaces.');
    }
    throw error;
  }
}

async function sendMenuEmail(menu, checkedAt = new Date().toISOString()) {
  const recipients = await getSubscriberEmails();
  if (!recipients.length) throw new Error('There are no subscribed email addresses.');

  const failures = [];
  for (const recipient of recipients) {
    try {
      await sendToRecipient(recipient, menu, checkedAt);
    } catch (error) {
      console.error('[email] Subscriber delivery failed:', error);
      failures.push(error);
    }
  }
  if (failures.length) {
    throw new AggregateError(failures, `Menu email delivery failed for ${failures.length} of ${recipients.length} subscriber(s).`);
  }
}

async function sendTestEmail(menu, recipient) {
  if (!await hasSubscription(recipient)) {
    throw new Error('Subscribe this email address before requesting a test email.');
  }
  return sendToRecipient(recipient.trim().toLowerCase(), menu, menu.checkedAt);
}

module.exports = { sendMenuEmail, sendTestEmail };
