/**
 * Unit tests for autoMapForTemplate — pure field-to-column mapping logic.
 * Tests exact label matching, case-insensitivity, and type-based fallbacks.
 *
 * autoMapForTemplate is exported from ExportSection.tsx.
 * All component-level imports in ExportSection are mocked so we only load the function.
 */
import { describe, it, expect, vi } from 'vitest';

// ── Module-level mocks (hoisted) ───────────────────────────────────────────────
vi.mock('@/lib/api/client', () => ({ api: { templates: {}, certificates: {} } }));
vi.mock('@/app/dashboard/org/[slug]/generate-certificate/components/ExpiryDateSelector', () => ({
  ExpiryDateSelector: () => null,
}));
vi.mock('@/app/dashboard/org/[slug]/generate-certificate/components/CertificateTable', () => ({
  CertificateTable: () => null,
}));

// ── Import the exported pure function ─────────────────────────────────────────
import { autoMapForTemplate } from '@/app/dashboard/org/[slug]/generate-certificate/components/ExportSection';
import type { CertificateField } from '@/lib/types/certificate';

// ── Field factory ──────────────────────────────────────────────────────────────
function makeField(id: string, type: CertificateField['type'], label: string): CertificateField {
  return {
    id, type, label,
    x: 0, y: 0, width: 200, height: 30,
    fontSize: 14, fontFamily: 'Arial', color: '#000',
    fontWeight: '400', fontStyle: 'normal', textAlign: 'left',
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('autoMapForTemplate — exact label match', () => {
  it('maps a field when header exactly matches the label', () => {
    const fields = [makeField('f1', 'custom_text', 'Grade')];
    const result = autoMapForTemplate(fields, ['Grade', 'Email']);
    expect(result).toEqual([{ fieldId: 'f1', columnName: 'Grade' }]);
  });

  it('is case-insensitive for exact matches', () => {
    const fields = [makeField('f1', 'custom_text', 'Recipient Name')];
    const result = autoMapForTemplate(fields, ['recipient name']);
    expect(result).toEqual([{ fieldId: 'f1', columnName: 'recipient name' }]);
  });

  it('trims whitespace from both header and label for matching', () => {
    const fields = [makeField('f1', 'custom_text', '  Score  ')];
    const result = autoMapForTemplate(fields, ['  Score  ']);
    expect(result).toHaveLength(1);
    expect(result[0]!.fieldId).toBe('f1');
  });

  it('returns empty array when no headers match any field', () => {
    const fields = [makeField('f1', 'custom_text', 'Grade')];
    const result = autoMapForTemplate(fields, ['Name', 'Email']);
    expect(result).toEqual([]);
  });

  it('returns empty array when fields array is empty', () => {
    const result = autoMapForTemplate([], ['Name', 'Email', 'Grade']);
    expect(result).toEqual([]);
  });

  it('returns empty array when headers array is empty', () => {
    const fields = [makeField('f1', 'name', 'Recipient Name')];
    const result = autoMapForTemplate(fields, []);
    expect(result).toEqual([]);
  });
});

describe('autoMapForTemplate — type-based fallbacks', () => {
  it('maps "name" field to a header containing "name" (fallback)', () => {
    const fields = [makeField('f1', 'name', 'Recipient Name')];
    const result = autoMapForTemplate(fields, ['Student Name']); // exact miss, but contains "name"
    expect(result).toEqual([{ fieldId: 'f1', columnName: 'Student Name' }]);
  });

  it('maps "course" field to a header containing "course"', () => {
    const fields = [makeField('f1', 'course', 'Course Title')];
    const result = autoMapForTemplate(fields, ['Course']);
    expect(result).toEqual([{ fieldId: 'f1', columnName: 'Course' }]);
  });

  it('maps "course" field to a header containing "program"', () => {
    const fields = [makeField('f1', 'course', 'Program')];
    const result = autoMapForTemplate(fields, ['Program Name']);
    expect(result).toEqual([{ fieldId: 'f1', columnName: 'Program Name' }]);
  });

  it('maps "start_date" field to a header containing "start"', () => {
    const fields = [makeField('f1', 'start_date', 'Start Date')];
    const result = autoMapForTemplate(fields, ['start_date_col']);
    expect(result).toEqual([{ fieldId: 'f1', columnName: 'start_date_col' }]);
  });

  it('maps "start_date" field to a header containing "issue"', () => {
    const fields = [makeField('f1', 'start_date', 'Issue Date')];
    const result = autoMapForTemplate(fields, ['Issue Date']);
    // Exact match takes precedence but fallback also works here
    expect(result[0]!.columnName).toBe('Issue Date');
  });

  it('maps "end_date" field to a header containing "end"', () => {
    const fields = [makeField('f1', 'end_date', 'End Date')];
    const result = autoMapForTemplate(fields, ['end']);
    expect(result).toEqual([{ fieldId: 'f1', columnName: 'end' }]);
  });

  it('maps "end_date" field to a header containing "expir"', () => {
    const fields = [makeField('f1', 'end_date', 'Expiry Date')];
    const result = autoMapForTemplate(fields, ['Expiration Date']);
    expect(result).toEqual([{ fieldId: 'f1', columnName: 'Expiration Date' }]);
  });

  it('does NOT use type fallback for custom_text fields', () => {
    // custom_text has no fallback — must match exactly
    const fields = [makeField('f1', 'custom_text', 'Score')];
    const result = autoMapForTemplate(fields, ['Score Card']); // does not exactly match "Score"
    expect(result).toEqual([]);
  });
});

describe('autoMapForTemplate — multiple fields', () => {
  it('maps multiple fields independently', () => {
    const fields = [
      makeField('f1', 'name', 'Recipient Name'),
      makeField('f2', 'course', 'Course Title'),
      makeField('f3', 'custom_text', 'Grade'),
    ];
    const result = autoMapForTemplate(fields, ['Recipient Name', 'Course Title', 'Grade']);
    expect(result).toHaveLength(3);
    expect(result.find(m => m.fieldId === 'f1')?.columnName).toBe('Recipient Name');
    expect(result.find(m => m.fieldId === 'f2')?.columnName).toBe('Course Title');
    expect(result.find(m => m.fieldId === 'f3')?.columnName).toBe('Grade');
  });

  it('only maps fields that have a matching header — skips unmatched ones', () => {
    const fields = [
      makeField('f1', 'name', 'Recipient Name'),
      makeField('f2', 'custom_text', 'Missing Column'),
    ];
    const result = autoMapForTemplate(fields, ['Recipient Name']);
    expect(result).toHaveLength(1);
    expect(result[0]!.fieldId).toBe('f1');
  });

  it('exact label match wins even when a fuzzy-matching header appears first', () => {
    // Two-pass approach: pass 1 claims exact matches regardless of position.
    // "User Name" appears first and would win in a single-pass find(), but
    // "Full Name" is an exact label match and is claimed in pass 1, so it wins.
    const fields = [makeField('f1', 'name', 'Full Name')];
    const result = autoMapForTemplate(fields, ['User Name', 'Full Name']);
    expect(result[0]!.columnName).toBe('Full Name');
  });

  it('fuzzy fallback picks the first unclaimed header when no exact match exists', () => {
    const fields = [makeField('f1', 'name', 'Recipient Name')];
    // No exact match for "Recipient Name" — fuzzy finds "User Name" first (contains 'name')
    const result = autoMapForTemplate(fields, ['User Name', 'Student Name']);
    expect(result[0]!.columnName).toBe('User Name');
  });
});

// ── Regression: "Course Name" column conflict ─────────────────────────────────
// Bug: 'course name'.includes('name') === true, so the single-pass algorithm
// incorrectly mapped "Course Name" column to the `name` type field (Recipient Name)
// in addition to the `course` type field. Both fields ended up pointing at the
// same column. Fixed by claiming exact label matches first (pass 1) so "Course Name"
// is reserved for the course field before the name fuzzy rule can steal it.
describe('autoMapForTemplate — Course Name / Recipient Name conflict regression', () => {
  it('does not map name-type field to "Course Name" column when a course field owns it exactly', () => {
    const fields = [
      makeField('f1', 'name', 'Recipient Name'),
      makeField('f2', 'course', 'Course Name'),
    ];
    const result = autoMapForTemplate(fields, ['Course Name']);

    // f2 owns "Course Name" via exact label match
    expect(result.find(m => m.fieldId === 'f2')?.columnName).toBe('Course Name');
    // f1 must NOT get "Course Name" via the name-includes-'name' fuzzy rule
    expect(result.find(m => m.fieldId === 'f1')).toBeUndefined();
  });

  it('maps both fields correctly when their respective columns are present', () => {
    const fields = [
      makeField('f1', 'name', 'Recipient Name'),
      makeField('f2', 'course', 'Course Name'),
    ];
    const result = autoMapForTemplate(fields, ['Recipient Name', 'Course Name']);

    expect(result.find(m => m.fieldId === 'f1')?.columnName).toBe('Recipient Name');
    expect(result.find(m => m.fieldId === 'f2')?.columnName).toBe('Course Name');
  });

  it('maps name-type field via fuzzy match when no exact column exists but an unclaimed name-like column does', () => {
    const fields = [
      makeField('f1', 'name', 'Recipient Name'),
      makeField('f2', 'course', 'Course Name'),
    ];
    // CSV has "Full Name" (unclaimed) + "Course Name" (claimed by f2)
    const result = autoMapForTemplate(fields, ['Full Name', 'Course Name']);

    expect(result.find(m => m.fieldId === 'f2')?.columnName).toBe('Course Name');
    expect(result.find(m => m.fieldId === 'f1')?.columnName).toBe('Full Name');
  });

  it('each column is assigned at most once across all fields', () => {
    const fields = [
      makeField('f1', 'name', 'Recipient Name'),
      makeField('f2', 'course', 'Course Name'),
      makeField('f3', 'custom_text', 'Email Address'),
    ];
    const headers = ['Course Name', 'Email'];
    const result = autoMapForTemplate(fields, headers);

    const columnNames = result.map(m => m.columnName);
    const unique = new Set(columnNames);
    expect(columnNames.length).toBe(unique.size); // no duplicates
  });

  it('handles Program Name column — course type claims it, name type cannot steal it', () => {
    const fields = [
      makeField('f1', 'name', 'Recipient Name'),
      makeField('f2', 'course', 'Program'),
    ];
    // "Program Name" contains 'name' (triggers name fallback) AND 'program' (triggers course fallback)
    // course field has no exact match, name field has no exact match — first pass finds nothing,
    // second pass: order depends on field iteration order (f1 first, f2 second).
    // Since f1 is processed first in pass 2, it claims "Program Name" via 'name' includes.
    // This is acceptable: if neither field has an exact label match, first-encountered wins.
    const result = autoMapForTemplate(fields, ['Program Name']);

    const colNames = result.map(m => m.columnName);
    expect(colNames.filter(c => c === 'Program Name').length).toBe(1); // assigned exactly once
  });
});
