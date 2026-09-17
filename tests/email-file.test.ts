// The wording of the results emails (messages.ts): safe HTML, names read naturally, and never a place.
import { describe, expect, it } from 'vitest';
import { adviserGreetingName, adviserMessage, studentMessage } from '@/lib/messages';

describe('the results emails', () => {
  it('a student’s message gives the letter grade and the group’s percentage, escapes names, and says no rank', () => {
    const m = studentMessage({ firstName: 'JUAN <B>', eventTitle: 'Tambiz 2027', groupName: 'SALT & PEPPER', letter: 'B+', groupPercent: '88.25%' });
    expect(m).toContain('<p>Hi Juan &lt;b&gt;,</p>');
    expect(m).toContain('Your letter grade: <b>B+</b>');
    expect(m).toContain('Your group’s score (SALT &amp; PEPPER): <b>88.25%</b>');
    expect(m).not.toMatch(/rank|place|top 10/i);
  });

  it('an adviser written SURNAME, FIRST NAME is greeted by name; each group is listed, top-10 ones marked without a place', () => {
    expect(adviserGreetingName('SANTOS, MARIA LOURDES')).toBe('Maria Lourdes Santos');
    expect(adviserGreetingName('Prof. Ramon Villareal')).toBe('Prof. Ramon Villareal');
    const m = adviserMessage({
      adviserName: 'DELA CRUZ, JOSE',
      eventTitle: 'Tambiz 2027',
      groups: [
        { name: 'PINILI', percent: '91.20%', topTen: ['Elevator Pitch', 'Overall'] },
        { name: 'BUGA', percent: '80.00%', topTen: [] },
        { name: 'WEAVE WALKS', percent: null, topTen: [] },
      ],
    });
    expect(m).toContain('<p>Dear Jose Dela Cruz,</p>');
    expect(m).toContain('through Tambiz 2027. Here is how they did:');
    expect(m).toContain('<li>PINILI: <b>91.20%</b> · <b>Top 10</b> in Elevator Pitch, Overall</li><li>BUGA: <b>80.00%</b></li><li>WEAVE WALKS: no score</li>');
    expect(m).toContain('a place in the top 10 is not the same as winning an award. Awards are announced at the ceremony.');
  });

  it('the award caution is there even when no group placed', () => {
    const m = adviserMessage({ adviserName: 'UY, TERESITA', eventTitle: 'Tambiz 2027', groups: [{ name: 'BUGA', percent: '70.00%', topTen: [] }] });
    expect(m).toContain('Here is how it did:');
    expect(m).toContain('not the same as winning an award');
  });
});
