// D3 default: text letterhead until SLU's official letterhead (logo,
// address block) is supplied — replace only this function then.
export function renderLetterhead(): string {
  return `
  <header class="letterhead">
    <p class="eyebrow">Saint Louis University</p>
    <p class="school">School of Accountancy, Management, Computing and Information Studies</p>
    <p class="address">A. Bonifacio Street, Baguio City 2600, Philippines</p>
  </header>`;
}

export const LETTER_CSS = `
  .letterhead { text-align: center; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 24px; }
  .letterhead .eyebrow { font-size: 14pt; font-weight: bold; letter-spacing: 1px; color: #1e3a5f; margin: 0; }
  .letterhead .school, .letterhead .address { margin: 2px 0; font-size: 9.5pt; color: #333; }
  .letter p { line-height: 1.55; margin: 0 0 12px; text-align: justify; }
  .letter .addressee { margin-bottom: 18px; line-height: 1.4; }
  .letter .closing { margin-top: 40px; }
  .ref { font-size: 8.5pt; color: #555; text-align: right; }
`;
