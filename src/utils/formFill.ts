import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from 'pdf-lib';

// ── Types ────────────────────────────────────────────────────────────

export interface FormField {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'other';
  currentValue: string;
  options?: string[]; // for dropdown/radio
  required?: boolean;
}

export interface UserProfile {
  fullName: string;
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  company: string;
  title: string;
  dateOfBirth: string;
  ssn4: string;
  driversLicense: string;
  website: string;
  signature: string;
  [key: string]: string;
}

export const EMPTY_PROFILE: UserProfile = {
  fullName: '', firstName: '', lastName: '', middleName: '',
  email: '', phone: '', address: '', city: '', state: '', zip: '', country: '',
  company: '', title: '', dateOfBirth: '', ssn4: '', driversLicense: '',
  website: '', signature: '',
};

export const PROFILE_FIELDS: { key: keyof UserProfile; label: string; placeholder: string }[] = [
  { key: 'firstName', label: 'First Name', placeholder: 'John' },
  { key: 'middleName', label: 'Middle Name', placeholder: 'A.' },
  { key: 'lastName', label: 'Last Name', placeholder: 'Doe' },
  { key: 'fullName', label: 'Full Name', placeholder: 'John A. Doe' },
  { key: 'email', label: 'Email', placeholder: 'john@example.com' },
  { key: 'phone', label: 'Phone', placeholder: '(555) 123-4567' },
  { key: 'address', label: 'Street Address', placeholder: '123 Main St' },
  { key: 'city', label: 'City', placeholder: 'Springfield' },
  { key: 'state', label: 'State', placeholder: 'FL' },
  { key: 'zip', label: 'ZIP Code', placeholder: '32801' },
  { key: 'country', label: 'Country', placeholder: 'United States' },
  { key: 'company', label: 'Company', placeholder: 'Acme Corp' },
  { key: 'title', label: 'Job Title', placeholder: 'Engineer' },
  { key: 'dateOfBirth', label: 'Date of Birth', placeholder: 'MM/DD/YYYY' },
  { key: 'ssn4', label: 'SSN (last 4)', placeholder: '1234' },
  { key: 'driversLicense', label: "Driver's License #", placeholder: 'D1234567' },
  { key: 'website', label: 'Website', placeholder: 'https://example.com' },
];

// ── Profile persistence ──────────────────────────────────────────────

const PROFILE_KEY = 'blueprint_user_profile';

export function loadProfile(): UserProfile {
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    if (saved) return { ...EMPTY_PROFILE, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return { ...EMPTY_PROFILE };
}

export function saveProfile(profile: UserProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

// ── Form field detection ─────────────────────────────────────────────

export async function detectFormFields(pdfData: ArrayBuffer): Promise<FormField[]> {
  const doc = await PDFDocument.load(pdfData.slice(0), { ignoreEncryption: true });
  const form = doc.getForm();
  const fields = form.getFields();
  const result: FormField[] = [];

  for (const field of fields) {
    const name = field.getName();
    let type: FormField['type'] = 'other';
    let currentValue = '';
    let options: string[] | undefined;

    if (field instanceof PDFTextField) {
      type = 'text';
      currentValue = field.getText() || '';
    } else if (field instanceof PDFCheckBox) {
      type = 'checkbox';
      currentValue = field.isChecked() ? 'true' : 'false';
    } else if (field instanceof PDFDropdown) {
      type = 'dropdown';
      options = field.getOptions();
      const selected = field.getSelected();
      currentValue = selected.length > 0 ? selected[0] : '';
    } else if (field instanceof PDFRadioGroup) {
      type = 'radio';
      options = field.getOptions();
      currentValue = field.getSelected() || '';
    }

    result.push({ name, type, currentValue, options });
  }

  return result;
}

// ── AI-powered field mapping ─────────────────────────────────────────

export async function aiFillMapping(
  apiKey: string,
  fields: FormField[],
  profile: UserProfile,
  additionalContext: string,
): Promise<Record<string, string>> {
  const fieldDescriptions = fields.map((f) => {
    let desc = `"${f.name}" (${f.type})`;
    if (f.options) desc += ` options: [${f.options.join(', ')}]`;
    if (f.currentValue) desc += ` current: "${f.currentValue}"`;
    return desc;
  }).join('\n');

  const profileEntries = Object.entries(profile)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const prompt = `You are a smart form-filling assistant. Given a user's profile data and a list of PDF form fields, determine the best value for each field.

USER PROFILE:
${profileEntries || '(no profile data provided)'}

${additionalContext ? `ADDITIONAL CONTEXT:\n${additionalContext}\n` : ''}
FORM FIELDS:
${fieldDescriptions}

INSTRUCTIONS:
- Match each form field to the most appropriate profile value based on the field name.
- For date fields, use the format that makes sense (MM/DD/YYYY unless the field name suggests otherwise).
- For checkboxes, return "true" or "false".
- For dropdowns/radios, return one of the available options that best matches.
- For fields like "Full Name", combine firstName + middleName + lastName if fullName is not provided.
- If today's date is needed, use: ${new Date().toLocaleDateString('en-US')}.
- If a field cannot be matched to any profile data, return an empty string for it.
- Be smart about field name variations: "fname" = firstName, "lname" = lastName, "addr" = address, etc.

Return ONLY a JSON object mapping field names to values. No explanation.
Example: {"First Name": "John", "Email": "john@example.com", "Agree": "true"}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
    },
  );

  if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
  const data = await response.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI did not return valid JSON');
  return JSON.parse(jsonMatch[0]);
}

// ── Apply fill to PDF ────────────────────────────────────────────────

export async function applyFill(
  pdfData: ArrayBuffer,
  mapping: Record<string, string>,
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.load(pdfData.slice(0), { ignoreEncryption: true });
  const form = doc.getForm();

  for (const [fieldName, value] of Object.entries(mapping)) {
    if (!value) continue;
    try {
      const field = form.getField(fieldName);
      if (field instanceof PDFTextField) {
        field.setText(value);
      } else if (field instanceof PDFCheckBox) {
        if (value === 'true' || value === 'yes' || value === 'Yes' || value === 'on') {
          field.check();
        } else {
          field.uncheck();
        }
      } else if (field instanceof PDFDropdown) {
        try { field.select(value); } catch { /* option might not exist */ }
      } else if (field instanceof PDFRadioGroup) {
        try { field.select(value); } catch { /* option might not exist */ }
      }
    } catch {
      // Field might not exist or be read-only
    }
  }

  const bytes = await doc.save();
  return bytes.buffer as ArrayBuffer;
}
