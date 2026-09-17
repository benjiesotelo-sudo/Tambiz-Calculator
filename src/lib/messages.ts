// Every word of the results emails, in one place. Change the wording here and nowhere else.
// Each message is complete HTML for one Excel cell, which Microsoft Power Automate sends as the email body.
// A student's message gives their letter grade and their group's score as a percentage, never a rank or a placing.
// An adviser's message lists each of their groups with its percentage and marks the ones that placed in the top 10,
// without saying which place, and says a top-10 placing is not an award.

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "MARIA LOURDES" becomes "Maria Lourdes"; a name already in mixed case is left alone. */
function readable(name: string) {
  const t = name.replace(/\s+/g, ' ').trim();
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s\-'.])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** An adviser written "SANTOS, MARIA LOURDES", as the registrar writes names, becomes "Maria Lourdes Santos". */
export function adviserGreetingName(name: string) {
  const [surname, first] = name.split(',').map((p) => p.trim());
  return readable(first ? `${first} ${surname}` : name);
}

export const EMAIL_SIGN_OFF = 'The Tambiz team<br>MGT1114 Business Plan 2';

export interface StudentMessage {
  firstName: string;
  eventTitle: string;
  groupName: string;
  /** For example "B+". */
  letter: string;
  /** For example "88.25%". */
  groupPercent: string;
}

export function studentMessage(m: StudentMessage): string {
  return [
    `<p>Hi ${escape(readable(m.firstName))},</p>`,
    `<p>Congratulations on finishing ${escape(m.eventTitle)}! Thank you for all the hard work you and your groupmates put in.</p>`,
    '<p>Here is your result:</p>',
    '<ul>',
    `<li>Your letter grade: <b>${escape(m.letter)}</b></li>`,
    `<li>Your group’s score (${escape(m.groupName)}): <b>${escape(m.groupPercent)}</b></li>`,
    '</ul>',
    '<p>If you have a question about your grade, please talk to your adviser.</p>',
    `<p>Well done!<br>${EMAIL_SIGN_OFF}</p>`,
  ].join('');
}

export interface AdviserGroupLine {
  name: string;
  /** For example "88.25%", or null when the group has no score. */
  percent: string | null;
  /** The categories, then "Overall", in which the group placed in the top 10. Empty when it placed in none. */
  topTen: string[];
}

export interface AdviserMessage {
  adviserName: string;
  eventTitle: string;
  groups: AdviserGroupLine[];
}

export function adviserMessage(m: AdviserMessage): string {
  const one = m.groups.length === 1;
  const lines = m.groups.map((g) => {
    const score = g.percent ? `<b>${escape(g.percent)}</b>` : 'no score';
    const top = g.topTen.length ? ` · <b>Top 10</b> in ${escape(g.topTen.join(', '))}` : '';
    return `<li>${escape(g.name)}: ${score}${top}</li>`;
  });
  return [
    `<p>Dear ${escape(adviserGreetingName(m.adviserName))},</p>`,
    `<p>Thank you for guiding your ${one ? 'group' : 'groups'} through ${escape(m.eventTitle)}. Here is how ${one ? 'it' : 'they'} did:</p>`,
    `<ul>${lines.join('')}</ul>`,
    '<p>Please note that a place in the top 10 is not the same as winning an award. Awards are announced at the ceremony.</p>',
    `<p>Thank you for your time and support.<br>${EMAIL_SIGN_OFF}</p>`,
  ].join('');
}
