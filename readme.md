# WhatsApp Expense Tracker Bot 📱💰

A WhatsApp-based expense tracking bot that helps you manage your daily expenses through simple chat commands. Track, analyze, and manage your spending habits right from your WhatsApp!

## 🚀 Features

- **Add Expenses**: Record expenses with amount, category, and date
- **Query Expenses**: 
  - View total expenses for today/yesterday
  - Check spending by category
  - List all recorded expenses
- **Manage Expenses**:
  - Edit existing expenses
  - Delete recorded expenses
- **Smart Date Handling**: Support for today, yesterday, and custom dates
- **Category Management**: Track expenses across different categories
- **Natural Language Processing**: Understand and process natural language commands

## 💻 Tech Stack

- **Backend**: Node.js with Express
- **Database**: MongoDB
- **Messaging**: Twilio WhatsApp API
- **AI/NLP**: Groq API (LLaMA 3.3 70B model)
- **Environment**: dotenv for configuration
- **Data Parsing**: body-parser for request handling

## 🛠️ Installation

1. Clone the repository:
```
git clone <repository-url>

cd whatsapp-expense-tracker
```
2. Install dependencies:
```
npm install
```
3. Create a `.env` file with the following variables:
```
GROQ_API_KEY=your_groq_api_key
MONGO_URI=your_mongodb_connection_string
TWILIO_ACCOUNT_SID=connection_string
TWILIO_AUTH_TOKEN=connection token
TWILIO_WHATSAPP_NUMBER=whatsapp:+91xxxxxxxxxx

```
4. Start the server:
```
node index.js
```
5. Use ngrok to get the url or deploy the code. 
``` ngrok http 3000 ```

6. Paste the Url to twillio whatsapp message sendbox settings.


## 📱 How to Use

Send WhatsApp messages to your configured Twilio number using these commands:

1. **Add Expense**:
   - `Spent ₹500 on food`
   - `Spent ₹1000 on groceries yesterday`

2. **Query Expenses**:
   - `How much did I spend today?`
   - `How much did I spend on food?`

3. **View All Expenses**:
   - `List all my expenses`
   - `Show expense breakdown`

4. **Edit Expense**:
   - `Change ₹500 food expense to ₹600`

5. **Delete Expense**:
   - `Remove ₹300 grocery expense from yesterday`

6. **Get Help**:
   - Type `help` for command list

## ⚙️ Configuration

1. Set up a Twilio account and configure WhatsApp sandbox
2. Set up MongoDB database
3. Obtain Groq API key
4. Configure webhook URL in Twilio to point to your server's `/sms` endpoint

## 🔒 Security

- Ensure your `.env` file is not committed to version control
- Use environment variables for sensitive information
- Implement proper authentication for production use

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
