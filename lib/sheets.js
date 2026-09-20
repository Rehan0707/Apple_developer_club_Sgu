import { google } from 'googleapis';
import { readFile } from 'node:fs/promises';

export class SheetsService {
  constructor(spreadsheetId, keyPath) {
    this.spreadsheetId = spreadsheetId;
    this.keyPath = keyPath;
    this.sheets = null;
  }

  async init() {
    if (this.sheets) return this.sheets;
    
    if (!this.keyPath) {
      console.warn('No GOOGLE_SERVICE_ACCOUNT_KEY_PATH provided. Sheets API disabled.');
      return null;
    }

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

  async setupSchema() {
    const sheets = await this.init();
    if (!sheets || !this.spreadsheetId) return;

    const requiredTabs = {
      Members: ['memberId', 'appleUserId', 'name', 'email', 'joinedDate', 'role'],
      Leaders: ['email', 'appleUserId'],
      Events: ['eventId', 'title', 'date', 'location', 'status'], // status: upcoming/past
      Registrations: ['registrationId', 'eventId', 'memberId', 'timestamp', 'attended'],
      Badges: ['badgeId', 'name', 'icon', 'type', 'triggerRule'], // type: auto/manual
      BadgeAwards: ['awardId', 'badgeId', 'memberId', 'date', 'awardedBy']
    };

    try {
      const response = await sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
      const existingTabs = response.data.sheets.map(s => s.properties.title);
      
      const requests = [];
      for (const [tabName, headers] of Object.entries(requiredTabs)) {
        if (!existingTabs.includes(tabName)) {
          // Add Sheet
          requests.push({
            addSheet: { properties: { title: tabName } }
          });
        }
      }
      
      if (requests.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: { requests }
        });
        
        // Write headers for newly created tabs
        for (const [tabName, headers] of Object.entries(requiredTabs)) {
          if (!existingTabs.includes(tabName)) {
            await sheets.spreadsheets.values.update({
              spreadsheetId: this.spreadsheetId,
              range: `${tabName}!A1`,
              valueInputOption: 'RAW',
              requestBody: { values: [headers] }
            });
          }
        }
      }
    } catch (e) {
      console.error('Failed to setup Sheets schema:', e);
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
          obj[header] = row[index] || '';
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
