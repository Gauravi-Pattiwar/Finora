# Finora - Finance + Aura

Finora is a browser-based financial health advisory prototype that helps users understand their income, expenses, savings, debt, spending habits, budgets, and financial goals.

The site provides rule-based financial insights, visual dashboards, budget planning, goal tracking, and downloadable reports. It is designed to make personal finance clearer and more approachable so users can make better-informed decisions.

Finora is an educational prototype only. It does not provide certified financial advice, investment guarantees, or recommendations to buy or sell financial products.

## Deployment configuration

The Vercel API uses MongoDB Atlas and JWT authentication. Configure these variables locally and in Vercel Project Settings:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/finora?retryWrites=true&w=majority
MONGODB_DB=finora
JWT_SECRET=replace-with-a-long-random-secret
```

Accounts use `/api/auth` for registration and login. Monthly analysis access through `/api/analyses` requires the returned JWT. Passwords are hashed before storage. Keep `.env` private and never commit it.
