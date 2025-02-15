require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const mongoose = require("mongoose");
const { MessagingResponse } = require("twilio").twiml;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

const expenseSchema = new mongoose.Schema({
  amount: Number,
  expenseCategory: String,
  date: { type: Date, default: Date.now }
});

const Expense = mongoose.model("Expense", expenseSchema);

// Function to extract user intent dynamically
async function processMessage(userMessage) {
  try {
    console.log("📩 User Input:", userMessage);

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `Extract intent and relevant details from user messages. Return JSON with:
            - intent: "add_expenses", "query", "list_categories", "edit_expense", "delete_expense", "list_all_expenses", "help"
            - extracted_fields: {
                expenses?: Array<{amount: number, category: string}>,
                amount?: number,
                new_amount?: number,
                category?: string,
                date?: "YYYY-MM-DD"|"yesterday"|"today",
                period?: "today"|"yesterday",
                type?: "total"|"category",
                old_amount?: number,
                old_category?: string
            }
            For multiple expenses in one message (e.g. "100 coffee, 200 chocolate, 500 jalebi"), 
            set intent as "add_expenses" and populate the expenses array.
            For other operations, parse natural language carefully.
            Example: "Change 500 food expense to 600" should set old_amount=500, old_category="food", new_amount=600`
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

    const result = JSON.parse(response.data.choices[0].message.content.trim());
    console.log("📝 Extracted Data:", result);
    return result;
  } catch (error) {
    console.error("❌ Groq API Error:", error.response?.data || error.message);
    throw new Error("Failed to process message");
  }
}

// Infer missing data
function inferDate(dateStr) {
    if (!dateStr || dateStr.toLowerCase() === "today") return new Date(); // Default to today

    if (dateStr.toLowerCase() === "yesterday") {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday;
    }

    // Handle multiple date formats
    const formats = ["DD/MM/YY", "D/M/YY", "YYYY-MM-DD", "MM/DD/YYYY"];
    for (const format of formats) {
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate)) return parsedDate;
    }

    console.warn("⚠️ Invalid date format:", dateStr);
    return new Date(); // Default fallback
}

  

// Fetch total expenses for a period
async function getTotalExpense(period) {
  const start = new Date();
  if (period === "yesterday") start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  const total = await Expense.aggregate([
    { $match: { date: { $gte: start, $lte: end } } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);

  return total.length ? `Total spent ${period}: ₹${total[0].total}` : `No expenses recorded ${period}.`;
}

// Fetch expenses by category
async function getExpenseByCategory(category) {
  const total = await Expense.aggregate([
    { $match: { expenseCategory: category } },
    { $group: { _id: "$expenseCategory", total: { $sum: "$amount" } } }
  ]);

  return total.length ? `Total spent on ${category}: ₹${total[0].total}` : `No expenses found for ${category}.`;
}

// Fetch all expenses
async function listAllExpenses() {
  const expenses = await Expense.find().sort({ date: -1 });
  return expenses.length ? expenses.map(exp => `${exp.date.toISOString().split("T")[0]}: ₹${exp.amount} on ${exp.expenseCategory}`).join("\n") : "No expenses recorded.";
}

// Help message
function getHelpMessage() {
  return `Available Commands:\n
  - Add expense: "Spent ₹500 on food yesterday"
  - Query total: "How much did I spend today?"
  - Query by category: "How much did I spend on food?"
  - Show all categories: "Show expense breakdown"
  - Edit expense: "Change ₹500 food expense to ₹600"
  - Delete expense: "Remove ₹300 grocery expense from yesterday"
  - Show all expenses: "List all my expenses"
  - Help: "What can you do?"`;
}

// Add these new functions
async function editExpense(oldAmount, oldCategory, newAmount) {
  if (!oldAmount || !oldCategory || !newAmount) {
    return `❌ Missing required fields. Format: "Change ₹500 food expense to ₹600"`;
  }

  const expense = await Expense.findOne({
    amount: oldAmount,
    expenseCategory: oldCategory
  }).sort({ date: -1 }); // Get the most recent matching expense

  if (!expense) {
    return `❌ Couldn't find a ${oldCategory} expense of ₹${oldAmount}. Please verify the amount and category.`;
  }

  expense.amount = newAmount;
  await expense.save();
  return `✅ Updated ${oldCategory} expense from ₹${oldAmount} to ₹${newAmount} (dated ${expense.date.toISOString().split('T')[0]})`;
}

async function deleteExpense(amount, category, date) {
  if (!amount || !category) {
    return `❌ Please specify both amount and category. Example: "Remove ₹300 grocery expense from yesterday"`;
  }

  const startDate = inferDate(date);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setHours(23, 59, 59, 999);

  const result = await Expense.findOneAndDelete({
    amount: amount,
    expenseCategory: category,
    date: { $gte: startDate, $lte: endDate }
  });

  if (!result) {
    return `❌ Couldn't find a ${category} expense of ₹${amount}${date ? ` on ${startDate.toISOString().split('T')[0]}` : ''}`;
  }

  return `✅ Deleted ${category} expense of ₹${amount} from ${startDate.toISOString().split('T')[0]}`;
}

// Add this function after the processMessage function
async function normalizeCategory(category) {
  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `Normalize expense categories into standard categories. Map user input to these fixed categories:
            - Food (restaurants, dining out, takeaway)
            - Groceries (supermarket, food items, household supplies)
            - Transport (uber, ola, taxi, bus, train, fuel)
            - Shopping (clothes, electronics, accessories)
            - Entertainment (movies, games, streaming)
            - Beverages (coffee, tea, drinks, smoothies)
            - Healthcare (medical, pharmacy, doctor)
            - Utilities (electricity, water, internet, phone)
            - Others (miscellaneous expenses)

            Return only the normalized category name without any explanation.
            Examples:
            - "cofee" -> "Beverages"
            - "ola to office" -> "Transport"
            - "cold coffee" -> "Beverages"
            - "lunch" -> "Food"
            `
          },
          { role: "user", content: category }
        ],
        temperature: 0.1,
        max_tokens: 50
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const normalizedCategory = response.data.choices[0].message.content.trim();
    console.log(`📝 Normalized category: ${category} -> ${normalizedCategory}`);
    return normalizedCategory;
  } catch (error) {
    console.error("❌ Category normalization error:", error.response?.data || error.message);
    return category; // Return original category if normalization fails
  }
}

// Modify the addMultipleExpenses function
async function addMultipleExpenses(expenses, date) {
  const expenseDate = inferDate(date);
  const savedExpenses = [];

  for (const exp of expenses) {
    const normalizedCategory = await normalizeCategory(exp.category);
    const expense = new Expense({
      amount: exp.amount,
      expenseCategory: normalizedCategory,
      date: expenseDate
    });
    await expense.save();
    savedExpenses.push(`₹${exp.amount} for ${normalizedCategory}`);
  }

  return `✅ Added expenses on ${expenseDate.toISOString().split("T")[0]}:\n${savedExpenses.join("\n")}`;
}

// Twilio Webhook
app.post("/sms", async (req, res) => {
  const twiml = new MessagingResponse();

  try {
    const processed = await processMessage(req.body.Body);
    const { intent, extracted_fields } = processed;

    if (intent === 'add_expenses') {
      if (extracted_fields.expenses && extracted_fields.expenses.length > 0) {
        twiml.message(await addMultipleExpenses(extracted_fields.expenses, extracted_fields.date));
      } else {
        twiml.message("❌ Please specify amounts and categories. Example: '100 coffee, 200 chocolate'");
      }
    }
    else if (intent === 'add_expense') {
      if (extracted_fields.amount && extracted_fields.category) {
        const expenseDate = inferDate(extracted_fields.date);
        const normalizedCategory = await normalizeCategory(extracted_fields.category);
        const expense = new Expense({ 
          amount: extracted_fields.amount, 
          expenseCategory: normalizedCategory, 
          date: expenseDate 
        });
        await expense.save();
        twiml.message(`✅ Added ₹${extracted_fields.amount} for ${normalizedCategory} on ${expenseDate.toISOString().split("T")[0]}`);
      } else {
        twiml.message("❌ Please specify amount and category. Example: 'Spent ₹500 on food yesterday'");
      }
    } 
    else if (intent === 'query') {
      if (extracted_fields.type === "total") {
        twiml.message(await getTotalExpense(extracted_fields.period));
      } else if (extracted_fields.type === "category" && extracted_fields.category) {
        twiml.message(await getExpenseByCategory(extracted_fields.category));
      } else {
        twiml.message("❌ Please provide a valid query. Example: 'How much did I spend on groceries?'");
      }
    }
    else if (intent === 'list_all_expenses') {
      twiml.message(`📜 All Expenses:\n${await listAllExpenses()}`);
    }
    else if (intent === 'help') {
      twiml.message(getHelpMessage());
    }
    else if (intent === 'edit_expense') {
      if (extracted_fields.old_amount && extracted_fields.old_category && extracted_fields.new_amount) {
        twiml.message(await editExpense(
          extracted_fields.old_amount,
          extracted_fields.old_category,
          extracted_fields.new_amount
        ));
      } else {
        twiml.message("❌ Please specify the expense to edit. Example: 'Change 500 food expense to 600'");
      }
    }
    else if (intent === 'delete_expense') {
      if (extracted_fields.amount && extracted_fields.category) {
        twiml.message(await deleteExpense(
          extracted_fields.amount,
          extracted_fields.category,
          extracted_fields.date
        ));
      } else {
        twiml.message("❌ Please specify the expense to delete. Example: 'Remove 300 grocery expense from yesterday'");
      }
    }
    else {
      twiml.message("❌ Sorry, I didn't understand that. Type 'help' to see available commands.");
    }
  } catch (error) {
    console.error("❌ Handler Error:", error);
    twiml.message("⚠️ Sorry, I couldn't process your request. Please try again.");
  }

  res.type("text/xml").send(twiml.toString());
});

// Start Server
app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
