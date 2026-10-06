import { describe, expect, it } from 'vitest';
import { ExportService } from '../../src/main/services/export-service';

describe('ExportService', () => {
  it('escapes formula-leading CSV text and exports centavos as exact PHP amounts', () => {
    const csv = new ExportService().reportToCsv('profit', {
      date: '2026-10-06', revenueCentavos: 123456, costCentavos: 23456, grossProfitCentavos: 100000,
      label: '=HYPERLINK("x")', note: '+danger',
    });
    expect(csv).toBe('date,revenue,cost,grossProfit,label,note\r\n2026-10-06,₱1234.56,₱234.56,₱1000.00,"\'=HYPERLINK(""x"")",\'+danger\r\n');
  });
});
