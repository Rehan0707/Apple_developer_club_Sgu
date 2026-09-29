import { google } from 'googleapis';

export class SheetsService {
  constructor(spreadsheetId, keyPath) {
    this.spreadsheetId = spreadsheetId;
    this.keyPath = keyPath;
    this.sheets = null;
  }

  get isConfigured() {
    return Boolean(this.spreadsheetId && this.keyPath);
  }

  async init() {
    if (this.sheets) return this.sheets;
    
    if (!this.isConfigured) return null;

    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: this.keyPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const client = await auth.getClient();
      this.sheets = google.sheets({ version: 'v4', auth: client });
      return this.sheets;
    } catch (e) {
      console.error('Failed to initialize Google Sheets:', e);
      return null;
    }
  }

  async checkConnection() {
    if (!this.isConfigured) return { configured: false, connected: false };
    const sheets = await this.init();
    if (!sheets) return { configured: true, connected: false };
    try {
      await sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
      return { configured: true, connected: true };
    } catch {
      return { configured: true, connected: false };
    }
  }

  async setupSchema() {
    const sheets = await this.init();
    if (!sheets || !this.spreadsheetId) return false;

    const requiredTabs = {
      Members: ['memberId', 'name', 'email', 'department', 'academicYear', 'status', 'createdAt'],
      Events: ['eventId', 'title', 'category', 'description', 'date', 'location', 'capacity', 'imageUrl', 'status', 'createdAt'],
      Registrations: ['registrationId', 'eventId', 'eventTitle', 'name', 'email', 'department', 'academicYear', 'notes', 'createdAt', 'status'],
      Resources: ['resourceId', 'title', 'category', 'url', 'status', 'createdAt'],
      Badges: ['badgeId', 'name', 'desc', 'icon', 'color', 'imageUrl', 'status', 'createdAt'],
      BadgeAwards: ['awardId', 'badgeId', 'memberId', 'date', 'awardedBy']
    };

    try {
      const response = await sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
      const existingTabs = new Set((response.data.sheets || []).map(sheet => sheet.properties.title));
      const requests = [];
      for (const [tabName, headers] of Object.entries(requiredTabs)) {
        if (!existingTabs.has(tabName)) requests.push({ addSheet: { properties: { title: tabName } } });
      }
      if (requests.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: { requests }
        });
      }
      for (const [tabName, requiredHeaders] of Object.entries(requiredTabs)) {
        const result = await sheets.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: `${tabName}!1:1` });
        const current = result.data.values?.[0] || [];
        const merged = [...current, ...requiredHeaders.filter(header => !current.includes(header))];
        if (!current.length || merged.length !== current.length) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${tabName}!A1`,
            valueInputOption: 'RAW',
            requestBody: { values: [merged] }
          });
        }
      }
      return true;
    } catch (e) {
      console.error('Failed to setup Google Sheets schema:', e.message);
      return false;
    }
  }

  async getHeaders(tabName) {
    const sheets = await this.init();
    if (!sheets || !this.spreadsheetId) return [];
    try {
      const response = await sheets.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: `${tabName}!1:1` });
      return response.data.values?.[0] || [];
    } catch (e) {
      console.error(`Failed to read headers for ${tabName}:`, e.message);
      return [];
    }
  }

  async getRows(tabName) {
    const sheets = await this.init();
    if (!sheets || !this.spreadsheetId) return [];

    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${tabName}`,
      });
      
      const rows = res.data.values || [];
      if (rows.length === 0) return [];
      
      const headers = rows[0];
      return rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, index) => {
          obj[header] = row[index] ?? '';
        });
        return obj;
      });
    } catch (e) {
      console.error(`Failed to get rows for ${tabName}:`, e);
      return [];
    }
  }

  async appendRow(tabName, rowData) {
    const sheets = await this.init();
    if (!sheets || !this.spreadsheetId) return false;

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${tabName}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowData] }
      });
      return true;
    } catch (e) {
      console.error(`Failed to append row to ${tabName}:`, e);
      return false;
    }
  }

  async appendObject(tabName, row) {
    const headers = await this.getHeaders(tabName);
    if (!headers.length) return false;
    return this.appendRow(tabName, headers.map(header => row[header] ?? ''));
  }

  async upsertObject(tabName, idField, row) {
    if (!this.isConfigured) return false;
    const rows = await this.getRows(tabName);
    const index = rows.findIndex(existing => String(existing[idField] || '') === String(row[idField] || ''));
    if (index < 0) return this.appendObject(tabName, row);
    const headers = await this.getHeaders(tabName);
    if (!headers.length) return false;
    const values = headers.map(header => row[header] ?? rows[index][header] ?? '');
    return this.updateRow(tabName, index, values);
  }

  async updateRow(tabName, rowIndex, rowData) {
    // rowIndex is 0-based index of the data row (not including header).
    // Sheet row number = rowIndex + 2 (1 for header, 1 for 1-based index)
    const sheets = await this.init();
    if (!sheets || !this.spreadsheetId) return false;

    const sheetRowNumber = rowIndex + 2;
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${tabName}!A${sheetRowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowData] }
      });
      return true;
    } catch (e) {
      console.error(`Failed to update row ${rowIndex} in ${tabName}:`, e);
      return false;
    }
  }
}

export const sheetsService = new SheetsService(
  process.env.GOOGLE_SPREADSHEET_ID,
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
);
