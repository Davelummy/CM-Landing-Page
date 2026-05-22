#!/usr/bin/env node
/**
 * Crystalline Max — B2B Email Campaign Sender
 *
 * Usage:
 *   node send.js --type "Fleet/Car Detailing" --dry-run
 *   node send.js --type "Office Cleaning" --limit 10
 *   node send.js --type "Property Management"
 *   node send.js --all --dry-run
 *
 * Options:
 *   --type <type>    Send to one lead type only
 *   --all            Send to all lead types
 *   --dry-run        Preview emails without sending
 *   --limit <n>      Max emails to send (default: all)
 *   --delay <ms>     Delay between sends in ms (default: 2000)
 *   --verified-csv   Path to verified lead export
 */

const fs = require('fs');
const path = require('path');

// ── Parse CLI args ──
const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx > -1 ? args[idx + 1] : null;
}

const API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'Crystalline Max <hello@ctmds.co.uk>';
const REPLY_TO_EMAIL = 'admin@ctmds.co.uk';
const SITE_URL = 'https://ctmds.co.uk';
const WHATSAPP_NUMBER = '447425241192';
const BUSINESS_ADDRESS = 'Crystalline Max Ltd, International House, 61 Mosley Street, Manchester, M2 3HZ';
const LEADS_CSV = getArg('--verified-csv') || process.env.VERIFIED_CSV || process.env.LEADS_CSV || path.join(require('os').homedir(), 'Desktop', 'crystalline_max_verified.csv');

const dryRun = args.includes('--dry-run');
const sendAll = args.includes('--all');
const leadType = getArg('--type');
const limit = getArg('--limit') ? parseInt(getArg('--limit')) : Infinity;
const delay = getArg('--delay') ? parseInt(getArg('--delay')) : 2000;

// Send to acceptable verifier statuses while excluding clear failures.
const SENDABLE_STATUSES = new Set([
  'safe',
  'safe-to-send',
  'deliverable',
  'valid',
  'valid-generic',
  'valid-risky',
  'valid-delivery-risk',
  'catch-all',
  'greylisted'
]);

if (!leadType && !sendAll) {
  console.log('Usage: node send.js --type "Office Cleaning" [--dry-run] [--limit 10] [--verified-csv /path/to/export.csv]');
  console.log('       node send.js --all [--dry-run] [--verified-csv /path/to/export.csv]');
  process.exit(1);
}

if (!API_KEY && !dryRun) {
  console.error('Error: RESEND_API_KEY environment variable is required.');
  console.error('Run: export RESEND_API_KEY="re_..."');
  process.exit(1);
}

// ── Parse CSV ──
function parseCSV(filepath) {
  const raw = fs.readFileSync(filepath, 'utf-8');
  const lines = raw.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (values[i] || '').trim());
    return obj;
  });
}

function normalizeStatus(status) {
  return (status || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function companyName(lead) {
  return escapeHtml(lead['Company Name'] || 'your team');
}

function greetingName(lead, genericTitles) {
  const contact = (lead['Contact Name'] || '').trim();
  if (!contact || genericTitles.has(contact)) return '';
  return ` ${escapeHtml(contact.split(' ')[0].split(' - ')[0])}`;
}

function unsubscribeMailto(email) {
  const body = `Please remove ${email || 'this address'} from your mailing list.`;
  return `mailto:${REPLY_TO_EMAIL}?subject=Unsubscribe&body=${encodeURIComponent(body)}`;
}

function whatsappUrl(text) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

function brandHeader() {
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
    <tr>
      <td style="vertical-align:middle;">
        <table role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <td style="width:44px;height:44px;border-radius:10px;background:#0A0C10;border:2px solid #00F5D4;text-align:center;vertical-align:middle;color:#00F5D4;font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:16px;letter-spacing:.04em;">
              CM
            </td>
            <td style="padding-left:12px;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
              Crystalline Max
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function emailLayout({ lead, intro, bullets, close, ctaText, ctaUrl, secondaryText, secondaryUrl }) {
  const unsubscribeUrl = unsubscribeMailto(lead.Email);
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
<div style="max-width:600px;margin:0 auto;padding:28px 20px;">
  <div style="background:#ffffff;border:1px solid #e5ecef;border-radius:8px;padding:28px;">
    ${brandHeader()}

    <p style="font-size:15px;line-height:1.65;margin:0 0 16px;color:#1f2933;">
      Hi${lead.greeting},
    </p>

    <p style="font-size:15px;line-height:1.65;margin:0 0 16px;color:#1f2933;">
      ${intro}
    </p>

    <ul style="font-size:15px;line-height:1.7;margin:0 0 20px;padding-left:20px;color:#1f2933;">
      ${bullets.map(item => `<li>${item}</li>`).join('')}
    </ul>

    <p style="font-size:15px;line-height:1.65;margin:0 0 22px;color:#1f2933;">
      ${close}
    </p>

    <p style="margin:0 0 22px;">
      <a href="${ctaUrl}" style="display:inline-block;background:#00F5D4;color:#0A0C10;font-weight:700;font-size:14px;text-decoration:none;padding:12px 18px;border-radius:6px;">
        ${ctaText}
      </a>
    </p>

    <p style="font-size:13px;line-height:1.6;margin:0;color:#60707a;">
      ${secondaryText} <a href="${secondaryUrl}" style="color:#087f73;text-decoration:underline;">${secondaryUrl.replace('https://', '')}</a>.
    </p>
  </div>

  <p style="font-size:11px;line-height:1.55;margin:16px 4px 0;color:#7b8790;">
    ${BUSINESS_ADDRESS}<br>
    You are receiving this because we believe Crystalline Max services may be relevant to ${companyName(lead)}.
    <a href="${unsubscribeUrl}" style="color:#087f73;text-decoration:underline;">Unsubscribe</a>
  </p>
</div>
</body>
</html>`;
}

function textEmail({ lead, intro, bullets, close, ctaText, ctaUrl, secondaryText, secondaryUrl }) {
  return [
    `Hi${lead.greeting},`,
    '',
    intro.replace(/&amp;/g, '&'),
    '',
    ...bullets.map(item => `- ${item.replace(/&amp;/g, '&')}`),
    '',
    close.replace(/&amp;/g, '&'),
    '',
    `${ctaText}: ${ctaUrl}`,
    `${secondaryText}: ${secondaryUrl}`,
    '',
    BUSINESS_ADDRESS,
    `You are receiving this because we believe Crystalline Max services may be relevant to ${lead['Company Name'] || 'your team'}.`,
    `Unsubscribe: ${unsubscribeMailto(lead.Email)}`
  ].join('\n');
}

function buildEmail(lead, config) {
  const preparedLead = {
    ...lead,
    greeting: greetingName(lead, config.genericTitles)
  };
  const company = companyName(lead);
  const content = config.content(preparedLead, company);
  return {
    subject: config.subject(lead),
    html: emailLayout({ lead: preparedLead, ...content }),
    text: textEmail({ lead: preparedLead, ...content })
  };
}


// ── Email Templates ──
const templates = {
  'Fleet/Car Detailing': {
    subject: (lead) => `Fleet detailing support for ${lead['Company Name']}`,
    genericTitles: new Set(['Business Specialist', 'Fleet Manager', 'Depot Manager', 'Corporate Sales', 'Fleet Team', 'Fleet Director', 'Logistics Manager', 'Operations Manager', 'Regional Manager - North', 'Regional Fleet Manager', 'Head of Fleet', 'Transport Manager', 'Vehicle Manager', 'Operations Director', 'Leasing Consultant', 'Commercial Manager', 'Commercial Director', 'Owner-Business', 'Client Director - Midlands']),
    content: (lead, company) => ({
      intro: `I am contacting ${company} because Crystalline Max provides mobile vehicle detailing for fleet operators in your area.`,
      bullets: [
        'On-site exterior and interior detailing',
        'Ceramic coating and paint correction where needed',
        'Before and after photo evidence for records',
        'Flexible scheduling for small or recurring fleets'
      ],
      close: `If fleet presentation or turnaround is something ${company} reviews, the landing page has the service details and enquiry options.`,
      ctaText: 'View Crystalline Max',
      ctaUrl: SITE_URL,
      secondaryText: 'You can also reply on WhatsApp',
      secondaryUrl: whatsappUrl(`Hi, I would like to discuss fleet detailing services for ${lead['Company Name'] || 'our business'}.`)
    })
  },

  'Office Cleaning': {
    subject: (lead) => `Cleaning support for ${lead['Company Name']}`,
    genericTitles: new Set(['Centre Manager', 'Community Manager', 'Office Manager', 'Practice Manager', 'Facilities Manager', 'Facilities Director', 'Property Director', 'Estate Director', 'Property Manager']),
    content: (lead, company) => ({
      intro: `I am contacting ${company} because Crystalline Max supports local workspaces with commercial cleaning and scheduled maintenance.`,
      bullets: [
        'Office, desk, kitchen and washroom cleaning',
        'After-hours and weekend scheduling options',
        'Photo evidence after completed visits',
        'Insured team for recurring or one-off work'
      ],
      close: `If you are reviewing cleaning suppliers, the landing page has the service details and enquiry options for ${company}.`,
      ctaText: 'View Crystalline Max',
      ctaUrl: SITE_URL,
      secondaryText: 'You can also reply on WhatsApp',
      secondaryUrl: whatsappUrl(`Hi, I would like to discuss office cleaning services for ${lead['Company Name'] || 'our business'}.`)
    })
  },

  'Property Management': {
    subject: (lead) => `Property cleaning support for ${lead['Company Name']}`,
    genericTitles: new Set(['Director', 'Property Manager', 'Property Director', 'Managing Director', 'Area Manager', 'Operations Manager', 'Head of Property', 'Regional Property Director', 'Regional Director', 'Chief Executive', 'Regional Property Manager', 'Facilities Manager', 'Lettings Director', 'Director of Property', 'Director of Lettings', 'Head of Facilities', 'Partner', 'Branch Manager']),
    content: (lead, company) => ({
      intro: `I am contacting ${company} because Crystalline Max provides cleaning support for property managers and managed spaces in your area.`,
      bullets: [
        'End-of-tenancy and turnover cleaning',
        'Communal area and hallway maintenance',
        'Photo evidence for completed work',
        'Same-week support where scheduling allows'
      ],
      close: `If cleaning cover is useful for upcoming turnovers or managed sites, the landing page has the service details and enquiry options for ${company}.`,
      ctaText: 'View Crystalline Max',
      ctaUrl: SITE_URL,
      secondaryText: 'You can also reply on WhatsApp',
      secondaryUrl: whatsappUrl(`Hi, I would like to discuss property cleaning support for ${lead['Company Name'] || 'our business'}.`)
    })
  }
};

// ── Send Email via Resend ──
async function sendEmail(to, subject, html, text) {
  const listUnsubscribe = `<${unsubscribeMailto(to)}>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text,
      reply_to: REPLY_TO_EMAIL,
      headers: {
        'List-Unsubscribe': listUnsubscribe,
        'List-Id': 'Crystalline Max Outreach <outreach.ctmds.co.uk>'
      }
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──
async function main() {
  const leads = parseCSV(LEADS_CSV);

  // Support both CSV formats: 'Lead Type' or 'Target Category'
  const typeKey = leads[0] && leads[0]['Target Category'] !== undefined ? 'Target Category' : 'Lead Type';
  const statusKey = leads[0] && leads[0]['Clearout Status'] !== undefined ? 'Clearout Status' : null;

  let filtered = sendAll ? leads : leads.filter(l => l[typeKey] === leadType);
  const targetedCount = filtered.length;

  // Keep only rows the verifier explicitly marked as sendable.
  filtered = filtered.filter(l => {
    if (!statusKey) return true;
    return SENDABLE_STATUSES.has(normalizeStatus(l[statusKey]));
  });
  const verifiedCount = filtered.length;

  // Deduplicate by email
  const seen = new Set();
  filtered = filtered.filter(l => {
    const email = (l['Email'] || '').trim().toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });

  if (limit < Infinity) filtered = filtered.slice(0, limit);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Crystalline Max — B2B Email Campaign`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Mode:    ${dryRun ? 'DRY RUN (no emails sent)' : 'LIVE'}`);
  console.log(`CSV:     ${LEADS_CSV}`);
  console.log(`Leads:   ${filtered.length}`);
  console.log(`Type:    ${sendAll ? 'All' : leadType}`);
  console.log(`Delay:   ${delay}ms between sends`);
  if (statusKey) {
    console.log(`Verify: ${verifiedCount}/${targetedCount} matched sendable statuses`);
  }
  console.log(`${'='.repeat(50)}\n`);

  let sent = 0, failed = 0;

  for (const lead of filtered) {
    const template = templates[lead[typeKey]];
    if (!template) {
      console.log(`  SKIP  ${lead['Email']} — unknown lead type: ${lead[typeKey]}`);
      continue;
    }

    const email = buildEmail(lead, template);

    if (dryRun) {
      console.log(`  PREVIEW  To: ${lead['Email']}`);
      console.log(`           Subject: ${email.subject}`);
      console.log(`           Company: ${lead['Company Name']} | Status: ${statusKey ? lead[statusKey] : 'n/a'}`);
      console.log('');
      sent++;
    } else {
      try {
        await sendEmail(lead['Email'], email.subject, email.html, email.text);
        console.log(`  SENT  ${lead['Email']} — ${lead['Company Name']}`);
        sent++;
        if (filtered.indexOf(lead) < filtered.length - 1) await sleep(delay);
      } catch (err) {
        console.log(`  FAIL  ${lead['Email']} — ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Done. ${sent} ${dryRun ? 'previewed' : 'sent'}, ${failed} failed.`);
  console.log(`${'='.repeat(50)}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
