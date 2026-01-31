import { initializeDatabase } from './data/database';
import { initializeContainer } from './core/container';
import { PrepService } from './services/PrepService';

async function testMeetingPrep() {
  // Step 1: Initialize database
  console.log('🗄️  Initializing database...\n');
  
  try {
    await initializeDatabase();
    console.log('✅ Database initialized\n');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    return;
  }
  
  // Step 2: Initialize container
  console.log('🔧 Initializing container...\n');
  
  try {
    await initializeContainer();
    console.log('✅ Container initialized\n');
  } catch (error) {
    console.error('❌ Failed to initialize container:', error);
    return;
  }
  
  const prepService = new PrepService();
  
  // Test 1: Collect meeting data for a contact
  console.log('🔍 TEST 1: Collecting meeting data...\n');
  
  const testEmail = 'bh@hubspot.com';
  const meetingData = await prepService.collectMeetingData(testEmail);
  
  console.log('Meeting Data:', JSON.stringify(meetingData, null, 2));
  
  // Test 2: Generate meeting prep
  console.log('\n🤖 TEST 2: Generating meeting prep...\n');
  
  const prepInput = {
    meeting: {
      meeting_type: 'Sales Call',
      objective: 'Discuss Q1 product roadmap and pricing'
    },
    participants: [
      {
        name: 'Brian Halligan',
        email: testEmail,
        company: 'HubSpot',
        domain: 'hubspot.com'
      }
    ]
  };
  
  try {
    const prepOutput = await prepService.generateMeetingPrep(prepInput);
    console.log('✅ Prep Generated:', JSON.stringify(prepOutput, null, 2));
  } catch (error) {
    console.error('❌ Error generating prep:', error);
  }
}

// Run the test
testMeetingPrep().catch(console.error);