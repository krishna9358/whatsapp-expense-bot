require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { system_prompt } = require("./system_prompt");
const { MessagingResponse } = require("twilio").twiml;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"; // Check Groq's latest API URL

// Function to send user messages to Groq API
async function processWithGroq(userMessage) {
  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: "llama-3.3-70b-versatile", // Use Groq's supported model
        messages: [
          { role: "system", content: system_prompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 100,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error(
      "Error with Groq API:",
      error.response?.data || error.message
    );
    return "Sorry, I couldn’t process your request.";
  }
}

async function extractData(userMessage) {
    try {
      const response = await axios.post(
        GROQ_API_URL,
        {
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: `You are an expense tracker bot. Extract the amount and expense category from the user's message and return only a the amount spent and the place where spend. 
              Do not include any extra text, explanations.`,
            },
            { role: "user", content: userMessage },
          ],
          max_tokens: 100,
        },
        {
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
  
      const llmResponse = response.data.choices[0].message.content.trim();
        const [amount, expenseCategory] = llmResponse.split(", ");
        console.log("Amount:", amount,"\n", "Expense Category:", expenseCategory);
        return { amount, expenseCategory };
    } catch (error) {
      console.error(
        "Error with Groq API (extractData):",
        error.response?.data || error.message
      );
      return { amount: null, expenseCategory: "Unknown" };
    }
  }
  

// Twilio webhook to handle incoming WhatsApp messages
app.post("/sms", async (req, res) => {
  const twiml = new MessagingResponse();
  const userMessage = req.body.Body.trim();

  // Check for common greetings
  if (/^(hi|hello)$/i.test(userMessage)) {
    twiml.message("Hi! How can I help you track your expenses today?");
  } else if (/^(bye|goodbye)$/i.test(userMessage)) {
    twiml.message("Goodbye! Stay on top of your finances.");
  } else {
    // First, try extracting expense data
    const { amount, expenseCategory } = await extractData(userMessage);
    
    if (amount !== null) {
      twiml.message(`Expense recorded: ₹${amount} for ${expenseCategory}.`);
    } else {
      // If it's not an expense, process as a general query
      const groqResponse = await processWithGroq(userMessage);
      twiml.message(groqResponse);
    }
  }

  res.type("text/xml").send(twiml.toString());
});

app.listen(3000, () => {
  console.log("Express server listening on port 3000");
});
