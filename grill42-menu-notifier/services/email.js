const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const dataDirectory = path.join(__dirname, '..', 'data');
const recipientFile = path.join(dataDirectory, 'recipient.json');

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

function getRecipientEmail() {
  try {
    return JSON.parse(fs.readFileSync(recipientFile, 'utf8')).email || null;
  } catch {
    return null;
  }
}

function saveRecipientEmail(email) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.writeFileSync(recipientFile, JSON.stringify({ email }, null, 2));
}

function formatMenuText(menu, checkedAt, timezone) {
  const date = new Date(checkedAt).toLocaleDateString('en-US', { timeZone: timezone, year: 'numeric', month: 'long', day: 'numeric' });
  const time = new Date(checkedAt).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' });
  const items = menu.items.length
    ? menu.items.map((item) => `- ${item.name}${item.description ? `: ${item.description}` : ''}`).join('\n')
    : '- No menu items were found.';

  return `Hello,\n\nHere is what is being served at The Grill 42 at Teraanga Commons Dining Hall.\n\nDate: ${date}\nTime: ${time}\n\nThe Grill 42:\n\n${items}\n\nSource:\n${menu.source}\n\nEnjoy your meal!`;
}

async function sendMenuEmail(menu, checkedAt = new Date().toISOString()) {
  const recipient = getRecipientEmail();
  if (!recipient) throw new Error('No recipient email has been saved.');
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

async function sendTestEmail(menu) {
  return sendMenuEmail(menu, menu.checkedAt);
}

module.exports = { getRecipientEmail, saveRecipientEmail, sendMenuEmail, sendTestEmail };
