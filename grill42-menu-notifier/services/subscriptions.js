const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const legacyRecipientFile = path.join(__dirname, '..', 'data', 'recipient.json');
const subscribersPerPage = 1000;
let supabaseClient;

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const { SUPABASE_URL, SUPABASE_SECRET, SUPABASE_TOKEN } = process.env;
  const apiKey = SUPABASE_SECRET || SUPABASE_TOKEN;
  const missing = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SECRET (or SUPABASE_TOKEN)', apiKey]
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Missing Supabase configuration: ${missing.join(', ')}`);
  }

  supabaseClient = createClient(SUPABASE_URL, apiKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return supabaseClient;
}

function throwIfError(error, operation) {
  if (error) throw new Error(`Supabase ${operation} failed: ${error.message}`);
}

async function addSubscription(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await getSupabaseClient()
    .from('subscriptions')
    .insert({ email: normalizedEmail })
    .select('email')
    .single();

  if (error?.code === '23505') return { email: normalizedEmail, subscribed: false };
  throwIfError(error, 'subscription save');
  return { email: data.email, subscribed: true };
}

async function migrateLegacyRecipient() {
  if (!fs.existsSync(legacyRecipientFile)) return;

  const { email } = JSON.parse(fs.readFileSync(legacyRecipientFile, 'utf8'));
  if (typeof email !== 'string' || !email.trim()) {
    throw new Error('The saved legacy recipient is invalid and could not be migrated.');
  }
  await addSubscription(email);
}

async function connectToDatabase() {
  getSupabaseClient();
  const { error } = await supabaseClient.from('subscriptions').select('email').limit(1);
  throwIfError(error, 'connection check');
  await migrateLegacyRecipient();
}

async function subscribeEmail(email) {
  return addSubscription(email);
}

async function unsubscribeEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await getSupabaseClient()
    .from('subscriptions')
    .delete()
    .eq('email', normalizedEmail)
    .select('email');
  throwIfError(error, 'subscription removal');
  return { unsubscribed: data.length > 0 };
}

async function hasSubscription(email) {
  const { data, error } = await getSupabaseClient()
    .from('subscriptions')
    .select('email')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  throwIfError(error, 'subscription lookup');
  return Boolean(data);
}

async function getSubscriberEmails() {
  const supabase = getSupabaseClient();
  const emails = [];

  for (let offset = 0; ; offset += subscribersPerPage) {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('email')
      .order('email')
      .range(offset, offset + subscribersPerPage - 1);
    throwIfError(error, 'subscriber list');
    emails.push(...data.map(({ email }) => email));
    if (data.length < subscribersPerPage) return emails;
  }
}

async function getSubscriberCount() {
  const { count, error } = await getSupabaseClient()
    .from('subscriptions')
    .select('email', { count: 'exact', head: true });
  throwIfError(error, 'subscriber count');
  return count;
}

module.exports = { connectToDatabase, getSubscriberEmails, getSubscriberCount, hasSubscription, subscribeEmail, unsubscribeEmail };
