// services/google-sheets.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Load service account credentials
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, '../credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const SHEET_ID = '1OPcv3A27ACF3fTedckPwDxT0XfE9IaJESUpJ-OXdARQ';

async function appendAppointment(dataRow) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Appointments',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: [dataRow],
    },
  });
}

async function appendSummary(callSid, summary) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Summaries',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: [[new Date().toISOString(), callSid, summary]],
    },
  });
}

module.exports = {
  appendAppointment,
  appendSummary,
};
