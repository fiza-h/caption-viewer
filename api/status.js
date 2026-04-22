const { google } = require("googleapis");

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_KEY");
  const credentials = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  
  try {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) return res.status(500).json({ error: "GOOGLE_SHEET_ID is missing" });
    
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "A:B"
    });
    
    const rows = response.data.values || [];
    const state = {};
    for (const row of rows) {
      if (row.length >= 2) {
        state[row[0]] = row[1];
      }
    }
    
    // Very short cache to keep Vercel fast but prevent spam
    res.setHeader("Cache-Control", "public, s-maxage=1, stale-while-revalidate=5");
    return res.status(200).json(state);
  } catch (err) {
    console.error("Status API Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
