# Finora - Finance + Aura

Finora is a browser-based financial health advisory prototype that helps users understand their income, expenses, savings, debt, spending habits, budgets, and financial goals.

The site provides rule-based financial insights, visual dashboards, budget planning, goal tracking, and downloadable reports. It is designed to make personal finance clearer and more approachable so users can make better-informed decisions.

Finora is an educational prototype only. It does not provide certified financial advice, investment guarantees, or recommendations to buy or sell financial products.

## Deploy to Vercel

1. Import this repository into Vercel and select **Other** as the framework preset. Keep the project root as the root directory; no build command or output directory is required.
2. Add these environment variables in the Vercel project settings for each deployment environment:
   - `MONGODB_URI`
   - `MONGODB_DB` (use `finora` unless you use a different database name)
   - `JWT_SECRET` (use a long, stable random value)
   - `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)
   - `GEMINI_MODEL` (optional)
3. Ensure your MongoDB Atlas network access rules allow connections from the deployed Vercel functions. Use a database user with read/write access to the application database.
4. Deploy. Vercel serves the static HTML, CSS, and JavaScript files and deploys the handlers in `api/` as serverless functions. The rewrite in `vercel.json` maps `/api/ai/summary`, `/api/ai/recommendations`, and `/api/ai/goal-plan` to `api/ai.js`.

`server.js` is for local development with `npm start`; Vercel uses the files under `api/` for the API routes. Do not commit `.env` or paste its secrets into a public repository.
