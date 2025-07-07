// test-google-sheets.js
const { appendAppointment, appendSummary } = require('./services/google-sheets');

async function runTests() {
  try {
    // Test 1: Append dummy appointment
    await appendAppointment([
      'Test User',
      '000000',
      'Test Appointment',
      '2025-07-08',
      '15:30',
      '+352 123456789',
      'test@example.com'
    ]);
    console.log('✅ Appointment test entry added');

    // Test 2: Append dummy call summary
    await appendSummary('TEST_CALL_SID_001', 'This is a test summary of the call.');
    console.log('✅ Call summary test entry added');
  } catch (err) {
    console.error('❌ Google Sheets test failed:', err);
  }
}

runTests();
