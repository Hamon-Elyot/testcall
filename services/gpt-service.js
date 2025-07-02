// For colored console logs and event handling
require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');

class GptService extends EventEmitter {
  constructor() {
    super();
    this.openai = new OpenAI();

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
• Informs at start: "This call is recorded for quality and assistance purposes."
You must add a '•' symbol every 5 to 10 words at natural pauses where your response can be split for text to speech.`
      },
      {
        role: 'assistant',
        content: `Hello, this is the ACL virtual assistant. • This call is recorded for quality and assistance purposes. • How can I assist you today?`
      }
    ];

    this.partialResponseIndex = 0;
  }

  setCallSid(callSid) {
    this.userContext.push({ role: 'system', content: `callSid: ${callSid}` });
  }

  updateUserContext(name, role, text) {
    if (name !== 'user') {
      this.userContext.push({ role, name, content: text });
    } else {
      this.userContext.push({ role, content: text });
    }
  }

  async completion(text, interactionCount, role = 'user', name = 'user') {
    this.updateUserContext(name, role, text);

    const stream = await this.openai.chat.completions.create({
      model: 'gpt-4o-latest',
      messages: this.userContext,
      stream: true,
    });

    let completeResponse = '';
    let partialResponse = '';

    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || '';
      let finishReason = chunk.choices[0].finish_reason;

      completeResponse += content;
      partialResponse += content;

      if (content.trim().slice(-1) === '•' || finishReason === 'stop') {
        const gptReply = {
          partialResponseIndex: this.partialResponseIndex,
          partialResponse
        };
        this.emit('gptreply', gptReply, interactionCount);
        this.partialResponseIndex++;
        partialResponse = '';
      }
    }

    this.userContext.push({ role: 'assistant', content: completeResponse });
    console.log(`GPT -> user context length: ${this.userContext.length}`.green);
  }
}

module.exports = { GptService };
