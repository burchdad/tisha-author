import { escapeHtml } from './visit-model.js';
export function inquiryEmail(record, origin) {
  const f = record.requested;
  const link = `${origin}/visits.html?id=${encodeURIComponent(record.id)}`;
  const rows = [['Name', f.name], ['School or organization', f.school], ['Email', f.email], ['Visit interest', f.interest], ['Requested date', f.preferredDate], ['Requested time', `${f.preferredTime} (${f.timeZone})`], ['Duration', `${f.durationMinutes} minutes`], ['Location or virtual details', f.location], ['Notes', f.notes]];
  return {
    subject: `School visit inquiry from ${f.school.replace(/[\r\n]/g, ' ')}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h1>New school visit request</h1><p>Awaiting your review. This request is not booked.</p>${rows.filter(([, v]) => v).map(([k, v]) => `<p><strong>${k}:</strong> ${escapeHtml(v).replaceAll('\n', '<br>')}</p>`).join('')}<p><a href="${escapeHtml(link)}" style="background:#173f37;color:white;padding:14px 20px;display:inline-block;border-radius:8px">Review visit request</a></p><p>Sign in, check your own calendar, and approve, request changes, or decline. Requested changes stay in your review until you send the reply draft to the school. After approval, you may download a calendar file and save it yourself. Reply to this email to contact the school. No action books a calendar event or sends a school confirmation automatically.</p></div>`,
    text: ['New school visit request', 'Awaiting your review. This request is not booked.', ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), `Review visit request: ${link}`, 'Sign in, check your own calendar, and approve, request changes, or decline. Send any requested changes to the school separately. Calendar files must be downloaded and saved manually. No action books a calendar event or sends a school confirmation automatically.'].join('\n\n'),
  };
}
