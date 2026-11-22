import { Platform } from 'react-native';

/**
 * Downloads a small CSV file (web): the sample layout every import screen offers, so the data
 * can be arranged in the same columns before uploading. Values with , " or a line break are
 * quoted. A UTF-8 BOM keeps Excel happy with ₹ and Indian names.
 */
export const downloadCsv = (filename, header, rows = []) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  const cell = (v) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const text = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  return true;
};
