require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const mongoose = require("mongoose");
const { MessagingResponse } = require("twilio").twiml;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Load environment variables
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MONGO_URI = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB connection error:", err));

// Define Expense Schema
const expenseSchema = new mongoose.Schema({
  amount: Number,
  expenseCategory: String,
  date: { type: Date, default: Date.now },
});

const Expense = mongoose.model("Expense", expenseSchema);

// Date range calculator
function getDateRange(range) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case 'this_month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'last_month':
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'last_week':
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    default:
      return { start: null, end: null };
  }
  return { start, end };
}

// Enhanced message processor
async function processMessage(userMessage) {
  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `Analyze messages and output JSON with:
            - intent: 'add_expense' or 'query'
            For add_expense: { amount: number, category: string }
            For query: { type: 'total'|'category'|'date', category?: string, period?: 'today'|'yesterday'|'this_month'|'last_month'|'last_week', date?: 'YYYY-MM-DD' }
            Examples:
            User: "Spent ₹300 on food" → { "intent": "add_expense", "amount": 300, "category": "food" }
            User: "Total spent yesterday" → { "intent": "query", "type": "total", "period": "yesterday" }
            User: "How much on groceries this month?" → { "intent": "query", "type": "category", "category": "groceries", "period": "this_month" }`
          },
          { role: "user", content: userMessage }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 200
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return JSON.parse(response.data.choices[0].message.content.trim());
  } catch (error) {
    console.error("Processing error:", error.response?.data || error.message);
    throw new Error("Message processing failed");
  }
}

// Unified query handler
async function handleQuery(query) {
  try {
    const filter = {};
    
    // Date filtering
    if (query.period) {
      const { start, end } = getDateRange(query.period);
      filter.date = { $gte: start, $lte: end };
    } else if (query.date) {
      const date = new Date(query.date);
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      filter.date = { $gte: date, $lt: nextDay };
    }

    // Category filtering
    if (query.category) {
      filter.expenseCategory = { $regex: new RegExp(query.category, 'i') };
    }

    const result = await Expense.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    return result[0]?.total || 0;
  } catch (error) {
    console.error("Query error:", error);
    return null;
  }
}

// Twilio webhook
app.post("/sms", async (req, res) => {
  const twiml = new MessagingResponse();
  try {
    const processed = await processMessage(req.body.Body);
    
    if (processed.intent === 'add_expense') {
      const expense = new Expense({
        amount: processed.amount,
        expenseCategory: processed.category
      });
      await expense.save();
      twiml.message(`Added ₹${processed.amount} under ${processed.category}`);
    } else if (processed.intent === 'query') {
      const total = await handleQuery(processed);
      
      if (total === null) throw new Error("Query failed");
      
      let response = `Total spent: ₹${total}`;
      if (processed.category) response += ` on ${processed.category}`;
      if (processed.period) response += ` (${processed.period})`;
      if (processed.date) response += ` on ${processed.date}`;

      twiml.message(response);
    }
  } catch (error) {
    console.error("Handler error:", error);
    twiml.message("Sorry, I couldn't process your request. Please try again.");
  }

  res.type("text/xml").send(twiml.toString());
});

// Start Server
app.listen(3000, () => {
  console.log("Server running on port 3000");
});