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

// Current datetime helper
function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  
  try {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) return res.status(500).json({ error: "GOOGLE_SHEET_ID missing" });
    
    // Parse body gracefully
    let data;
    if (typeof req.body === 'string') {
        data = JSON.parse(req.body);
    } else {
        data = req.body;
    }
    
    const { image_id, action } = data;
    if (!image_id || !action) {
      return res.status(400).json({ error: "image_id and action are required" });
    }
    
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "A:C",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[image_id, action, getTimestamp()]]
      }
    });
    
    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Action API Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
