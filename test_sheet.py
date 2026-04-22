import os, json, base64, time
from pathlib import Path
from google.oauth2 import service_account
from googleapiclient.discovery import build

for line in Path('.env').read_text().splitlines():
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        os.environ[k.strip()] = v.strip()

raw_key = os.environ['GOOGLE_SERVICE_ACCOUNT_KEY']
creds_json = json.loads(base64.b64decode(raw_key).decode('utf-8'))
print("Client Email:", creds_json["client_email"])

creds = service_account.Credentials.from_service_account_info(
    creds_json, scopes=['https://www.googleapis.com/auth/spreadsheets']
)
service = build('sheets', 'v4', credentials=creds)

try:
    print('Testing append...')
    body = {'values': [['test_image_1', 'accept', time.strftime('%Y-%m-%d %H:%M:%S')]]}
    resp = service.spreadsheets().values().append(
        spreadsheetId=os.environ['GOOGLE_SHEET_ID'],
        range='Sheet1!A:C',
        valueInputOption='USER_ENTERED',
        insertDataOption='INSERT_ROWS',
        body=body
    ).execute()
    print('Append SUCCESS:', resp)
except Exception as e:
    print('Append FAILED:', str(e))
