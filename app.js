// Import required packages and services
require('dotenv').config();
require('colors');
const express = require('express');
const ExpressWs = require('express-ws');
const { GptService } = require('./services/gpt-service');
const { StreamService } = require('./services/stream-service');
const { TranscriptionService } = require('./services/transcription-service');
const { TextToSpeechService } = require('./services/tts-service');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

// Set up Express with WebSocket support
const app = express();
ExpressWs(app);
const PORT = process.env.PORT || 3000;

// Add body parsers to handle POST data from Twilio
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Handle incoming calls from Twilio
app.post('/incoming', (req, res) => {
  try {
    const response = new VoiceResponse();
    const connect = response.connect();

    if (!process.env.SERVER) {
      throw new Error('SERVER environment variable not set');
    }

    connect.stream({ url: `wss://${process.env.SERVER}/connection` });

    res.type('text/xml');
    res.send(response.toString());
  } catch (err) {
    console.error('Error in /incoming route:', err);
    const response = new VoiceResponse();
    response.say('Sorry, an error occurred. Goodbye.');
    res.type('text/xml');
    res.status(500).send(response.toString());
  }
});

// WebSocket connection for call audio
app.ws('/connection', (ws) => {
  try {
    ws.on('error', console.error);

    let streamSid;
    let callSid;
    const gptService = new GptService();
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TextToSpeechService({});
    let marks = [];
    let interactionCount = 0;

    ws.on('message', async (data) => {
      const msg = JSON.parse(data);

      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        streamService.setStreamSid(streamSid);
        gptService.setCallSid(callSid);
        console.log(`Twilio -> Starting Media Stream for ${streamSid}`.underline.red);
        ttsService.generate({ partialResponseIndex: null, partialResponse: 'Welcome to A.C.L Automobile Club Luxembourg. • How can I help you today?' }, 0);
      } else if (msg.event === 'media') {
        transcriptionService.send(msg.media.payload);
      } else if (msg.event === 'mark') {
        const label = msg.mark.name;
        console.log(`Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red);
        marks = marks.filter(m => m !== label);
      } else if (msg.event === 'stop') {
        console.log(`Twilio -> Media stream ${streamSid} ended.`.underline.red);
      }
    });

    transcriptionService.on('utterance', async (text) => {
      if (marks.length > 0 && text?.length > 5) {
        console.log('Twilio -> Interruption, Clearing stream'.red);
        ws.send(JSON.stringify({ streamSid, event: 'clear' }));
      }
    });

    transcriptionService.on('transcription', async (text) => {
      if (!text) return;
      console.log(`Interaction ${interactionCount} – STT -> GPT: ${text}`.yellow);
      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });

    gptService.on('gptreply', async (gptReply, icount) => {
      console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green);
      ttsService.generate(gptReply, icount);
    });

    ttsService.on('speech', (responseIndex, audio, label, icount) => {
      console.log(`Interaction ${icount}: TTS -> TWILIO: ${label}`.blue);
      streamService.buffer(responseIndex, audio);
    });

    streamService.on('audiosent', (markLabel) => {
      marks.push(markLabel);
    });
  } catch (err) {
    console.error('Error in WebSocket connection:', err);
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('✅ AI Assistant is live!');
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
