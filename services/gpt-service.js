// services/gpt-service.js
require('dotenv').config();
require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');

class GptService extends EventEmitter {
  constructor() {
    super();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.resetContext();
  }

  resetContext() {
    this.userContext = [
      {
        role: 'system',
        content: `You are ACL Assistant, helping ACL members in Luxembourg with roadside assistance, travel advice, and events. 
• Always identify yourself: "Hello, this is the ACL virtual assistant." 
• Keep responses brief and helpful (max one question at a time). 
• Use ACL key info:
  - 24/7 roadside assistance in Luxembourg and Europe
  - Member benefits: towing, car rental, diagnostics, travel advice
  - Contact numbers: +352 26 000 (single assistance), +352 45 00 45 -1 (member services, Mon–Fri 8–18)
• If it's urgent or outside your scope, offer to connect them with a human agent.
• Inform at start: "This call is recorded for quality and assistance purposes."
You must add a '•' symbol every 5 to 10 words at natural pauses where your response can be split for text to speech.`
      },
      {
        role: 'assistant',
        content: `Hello, this is the A.C.L virtual assistant. • This call is recorded for quality and assistance purposes. • How can I assist you today?`
      }
    ];
    this.partialResponseIndex = 0;
  }

  setCallSid(callSid) {
    // Reset context per call to avoid context bleed across calls
    this.resetContext();
    this.userContext.push({ role: 'system', content: `callSid: ${callSid}` });
    this.partialResponseIndex = 0;
  }

  updateUserContext(role, content) {
    // Add user or assistant message to context
    this.userContext.push({ role, content });

    // Limit context length to last 20 messages to control token size
    if (this.userContext.length > 20) {
      this.userContext = this.userContext.slice(this.userContext.length - 20);
    }
  }

  async completion(text, interactionCount) {
    try {
      // Add user input
      this.updateUserContext('user', text);

      // Create streaming chat completion
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

        // Emit partial responses when a '•' is encountered or when complete
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

      // Add assistant full reply to context
      this.updateUserContext('assistant', completeResponse);

      console.log(`GPT -> user context length: ${this.userContext.length}`.green);
    } catch (error) {
      console.error('Error during GPT completion:', error);
      this.emit('error', error);
    }
  }
}

module.exports = { GptService };
