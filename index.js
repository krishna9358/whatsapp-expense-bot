require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { system_prompt } = require('./system_prompt');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'; // Check Groq's latest API URL

// Function to send user messages to Groq API
async function processWithGroq(userMessage) {
  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: 'llama-3.3-70b-versatile', // Use Groq's supported model
        messages: [{ role: 'system', content: system_prompt },{ role: 'user', content: userMessage }],
        max_tokens: 100,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error with Groq API:', error.response?.data || error.message);
    return 'Sorry, I couldn’t process your request.';
  }
}

// Twilio webhook to handle incoming WhatsApp messages
app.post('/sms', async (req, res) => {
  const twiml = new MessagingResponse();
  const userMessage = req.body.Body;

  // Check for common greetings before calling LLM
  if (/^(hi|hello)$/i.test(userMessage)) {
    twiml.message('Hi! How can I help you track your expenses today?');
  } else if (/^(bye|goodbye)$/i.test(userMessage)) {
    twiml.message('Goodbye! Stay on top of your finances.');
  } else {
    // Process message with Groq LLM
    const groqResponse = await processWithGroq(userMessage);
    twiml.message(groqResponse);
  }

  res.type('text/xml').send(twiml.toString());
});

app.listen(3000, () => {
  console.log('Express server listening on port 3000');
});
