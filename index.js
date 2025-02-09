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
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Define Expense Schema
const expenseSchema = new mongoose.Schema({
  amount: Number,
  expenseCategory: String,
  date: { type: Date, default: Date.now },
});

const Expense = mongoose.model("Expense", expenseSchema);

// Function to extract amount and category using LLM
async function extractData(userMessage) {
  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are an expense tracker bot. Extract the amount and category from the user's message in JSON format:
            {
              "amount": <numeric_value>,
              "expense_category": "<category_name>"
            }
            No extra text or explanation, only JSON output.`,
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
    if (llmResponse.startsWith("{") && llmResponse.endsWith("}")) {
      const parsedData = JSON.parse(llmResponse);
      const amount = parsedData.amount || null;
      const expenseCategory = parsedData.expense_category || "Unknown";

      if (amount && expenseCategory) {
        // Save expense to MongoDB
        const newExpense = new Expense({ amount, expenseCategory });
        await newExpense.save();
      }

      return { amount, expenseCategory };
    } else {
      throw new Error("Invalid JSON response from LLM");
    }
  } catch (error) {
    console.error(
      "Error with Groq API (extractData):",
      error.response?.data || error.message
    );
    return { amount: null, expenseCategory: "Unknown" };
  }
}

// Function to get total expenses
async function getTotalExpenses() {
  const total = await Expense.aggregate([
    { $group: { _id: null, totalSpent: { $sum: "$amount" } } },
  ]);
  return total.length > 0 ? total[0].totalSpent : 0;
}

// Function to get expenses by category
async function getExpensesByCategory(category) {
  const total = await Expense.aggregate([
    { $match: { expenseCategory: { $regex: new RegExp(category, "i") } } },
    { $group: { _id: "$expenseCategory", totalSpent: { $sum: "$amount" } } },
  ]);
  return total.length > 0 ? total[0].totalSpent : 0;
}

// Function to get expenses by date
async function getExpensesByDate(date) {
  const startDate = new Date(date);
  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + 1); // Include entire day

  const total = await Expense.aggregate([
    { $match: { date: { $gte: startDate, $lt: endDate } } },
    { $group: { _id: null, totalSpent: { $sum: "$amount" } } },
  ]);
  return total.length > 0 ? total[0].totalSpent : 0;
}

// Twilio webhook to handle incoming WhatsApp messages
app.post("/sms", async (req, res) => {
  const twiml = new MessagingResponse();
  const userMessage = req.body.Body.toLowerCase();

  if (/^(hi|hello)$/i.test(userMessage)) {
    twiml.message("Hi! How can I help you track your expenses today?");
  } else if (/^(bye|goodbye)$/i.test(userMessage)) {
    twiml.message("Goodbye! Stay on top of your finances.");
  } else if (/total expenses/.test(userMessage)) {
    const totalSpent = await getTotalExpenses();
    twiml.message(`Your total expenses so far: ₹${totalSpent}`);
  } else if (/spent on (.+)/.test(userMessage)) {
    const match = userMessage.match(/spent on (.+)/);
    if (match) {
      const category = match[1].trim();
      const totalSpent = await getExpensesByCategory(category);
      twiml.message(`You have spent ₹${totalSpent} on ${category}.`);
    }
  } else if (/expenses on (\d{4}-\d{2}-\d{2})/.test(userMessage)) {
    const match = userMessage.match(/expenses on (\d{4}-\d{2}-\d{2})/);
    if (match) {
      const date = match[1];
      const totalSpent = await getExpensesByDate(date);
      twiml.message(`You spent ₹${totalSpent} on ${date}.`);
    }
  } else {
    // Process as an expense entry
    const { amount, expenseCategory } = await extractData(userMessage);
    if (amount && expenseCategory) {
      twiml.message(`Saved expense: ₹${amount} on ${expenseCategory}.`);
    } else {
      twiml.message("I couldn't process your request. Please try again.");
    }
  }

  res.type("text/xml").send(twiml.toString());
});

// Start Server
app.listen(3000, () => {
  console.log("Express server listening on port 3000");
});
