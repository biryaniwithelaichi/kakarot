import OpenAI from 'openai';

async function testAIGeneration() {
  console.log('🤖 Testing AI Meeting Prep Generation...\n');
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY not found in environment');
    console.log('💡 Set it in your .env file or run: export OPENAI_API_KEY=your-key');
    return;
  }
  
  const openai = new OpenAI({ apiKey });
  
  const mockContext = {
    participant: {
      name: 'Brian Halligan',
      email: 'bh@hubspot.com',
      company: 'HubSpot',
      domain: 'hubspot.com'
    },
    pastMeetings: [
      { title: 'Q4 Review', date: '2024-12-15', topics: ['Revenue', 'Product roadmap'] },
      { title: 'Product Sync', date: '2024-11-20', topics: ['Feature requests', 'UI feedback'] }
    ]
  };
  
  const prompt = `You are an expert meeting preparation agent. Generate a 5-minute meeting briefing in strict JSON format.

MEETING DETAILS:
- Type: Sales Call
- Objective: Discuss Q1 product roadmap and pricing
- Participant: ${mockContext.participant.name} (${mockContext.participant.email})

PARTICIPANT CONTEXT:
- Company: ${mockContext.participant.company}
- Past Meetings: ${mockContext.pastMeetings.length}
- Recent Topics: ${mockContext.pastMeetings.map(m => m.topics.join(', ')).join('; ')}

Generate 2-3 talking points and 1-2 questions based on this context.
Return VALID JSON only - no markdown, no code fences, just the JSON object:
{
  "talking_points": ["string"],
  "questions_to_ask": ["string"],
  "key_topics": ["string"]
}`;

  try {
    console.log('📤 Sending to OpenAI...\n');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a meeting prep assistant. Return only valid JSON without markdown formatting.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 500
    });
    
    const content = response.choices[0].message.content;
    console.log('📥 AI Response:\n');
    console.log(content);
    
    // Strip markdown code fences if present
    let cleanContent = content || '{}';
    cleanContent = cleanContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const parsed = JSON.parse(cleanContent);
    console.log('\n✅ Successfully parsed JSON:\n');
    console.log(JSON.stringify(parsed, null, 2));
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  }
}

testAIGeneration();