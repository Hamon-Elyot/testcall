// services/gpt-service.js
require('dotenv').config();
require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');
const { appendAppointment, appendSummary } = require('./google-sheets');

class GptService extends EventEmitter {
  constructor() {
    super();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.resetContext();
  }

  resetContext() {
    this.userContext = [
      {
        role: 'system',
        content: `
You are ACL Assistant, an intelligent and polite virtual agent for the Automobile Club Luxembourg (ACL). You assist members with roadside services, general inquiries, travel advice, and appointment bookings.

🟡 Key Behavior Rules:
- Always begin by identifying yourself: "Hello, this is the ACL virtual assistant."
- Clearly inform: "This call is recorded for quality and assistance purposes."
- Keep responses clear, concise, and friendly.
- Ask one question at a time, wait for a user response before continuing.
- Insert a '•' bullet every 5–10 words at natural pauses for text-to-speech pacing.

✅ ACL Key Services to Mention:
- Roadside assistance in Luxembourg and Europe (24/7)
- Member benefits: towing, diagnostics, travel planning, vehicle rental
- Contact numbers: +352 26 000 (assistance), +352 45 00 45 -1 (member services, Mon–Fri 8–18)

📅 Appointments:
- You can assist members in booking appointments such as vehicle diagnostics, roadworthiness checks, or travel consultations.
- Ask for appointment details one at a time: start with name, then membership number (if available), then type of appointment, then date, then time, then phone, then email.
- Wait for user response before asking the next question.
- Only proceed to the next field once the previous one is provided.
- Only return a <save_appointment> tag once all 7 details have been collected.
- Example: "<save_appointment>John Doe, 123456, Vehicle Check, 2025-07-08, 10:00, +352 621 000 111, john@example.com</save_appointment>"

🆘 Escalation:
- If the request is urgent or beyond your capability, say: “Let me connect you with a human agent.”

Example starter: 
"Hello, this is the ACL virtual assistant. • This call is recorded for quality and assistance purposes. • How can I help you today?"
`
      },
      {
        role: 'assistant',
        content: `Hello, this is the ACL virtual assistant. • This call is recorded for quality and assistance purposes. • How can I help you today?`
      }
    ];
    this.partialResponseIndex = 0;
    this.callSid = null;
  }

  setCallSid(callSid) {
    this.callSid = callSid;
    this.resetContext();
    this.userContext.push({ role: 'system', content: `callSid: ${callSid}` });
    this.partialResponseIndex = 0;
  }

  updateUserContext(role, content) {
    this.userContext.push({ role, content });
    if (this.userContext.length > 20) {
      this.userContext = this.userContext.slice(-20);
    }
  }

  async completion(text, interactionCount) {
    try {
      this.updateUserContext('user', text);

      const stream = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: this.userContext,
        stream: true,
      });

      let completeResponse = '';
      let partialResponse = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        const finishReason = chunk.choices[0].finish_reason;

        completeResponse += content;
        partialResponse += content;

        if (content.trim().endsWith('•') || finishReason === 'stop') {
          const gptReply = {
            partialResponseIndex: this.partialResponseIndex,
            partialResponse,
          };
          this.emit('gptreply', gptReply, interactionCount);
          this.partialResponseIndex++;
          partialResponse = '';
        }
      }

      this.updateUserContext('assistant', completeResponse);
      console.log(`GPT -> user context length: ${this.userContext.length}`.green);

      const appointmentMatch = completeResponse.match(/<save_appointment>(.*?)<\/save_appointment>/i);
      if (appointmentMatch) {
        const appointmentText = appointmentMatch[1];
        const parsed = this.extractAppointmentData(appointmentText);
        if (parsed) {
          await appendAppointment(parsed);
          console.log('✅ Appointment saved to Google Sheets'.cyan);
        }
      }

      if (interactionCount > 2 && this.callSid) {
        const summaryPrompt = [
          ...this.userContext,
          { role: 'system', content: 'Please summarize this call in 2–3 sentences for internal review.' }
        ];

        const summaryCompletion = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: summaryPrompt,
        });

        const summary = summaryCompletion.choices?.[0]?.message?.content?.trim();
        if (summary) {
          await appendSummary(this.callSid, summary);
          console.log('📝 Call summary saved to Google Sheets'.cyan);
        }
      }
    } catch (error) {
      console.error('Error during GPT completion:', error);
      this.emit('error', error);
    }
  }

  extractAppointmentData(text) {
    const parts = text.split(',').map(p => p.trim());
    if (parts.length < 7) {
      console.warn('⚠️ Could not parse appointment properly. Expecting 7 fields.');
      return null;
    }

    const [name, membership, type, date, time, phone, email] = parts;
    return [name, membership, type, date, time, phone, email];
  }
}

module.exports = { GptService };
