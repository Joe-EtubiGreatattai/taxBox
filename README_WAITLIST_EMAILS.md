# Waitlist Email Migration Script

## Purpose
This script sends confirmation emails to all existing waitlist members who signed up before the email feature was implemented.

## Prerequisites
- Node.js installed
- MongoDB connection configured in `.env`
- Email credentials configured in `.env`:
  - `EMAIL_USER=greatattai442442@gmail.com`
  - `EMAIL_PASS=cduyxrdlkskbuvmz`

## How to Run

### Local Testing
```bash
cd /Users/mac/Documents/Tax-e/backend
node sendWaitlistEmails.js
```

### On Production Server
```bash
ssh root@46.175.147.124
cd /var/www/taxBox
node sendWaitlistEmails.js
```

## What the Script Does

1. Connects to MongoDB
2. Fetches all existing waitlist members
3. Sends a confirmation email to each member
4. Shows progress for each email sent
5. Provides a summary of successful and failed sends
6. Adds a 500ms delay between emails to avoid rate limiting

## Output Example

```
🚀 Starting waitlist email migration...

🔌 Connecting to MongoDB...
✅ MongoDB connected successfully

📋 Fetching waitlist members...
✅ Found 25 members on the waitlist

📧 Starting to send confirmation emails...

[1/25] Sending email to: john@example.com (John Doe)
[1/25] ✅ Email sent successfully to john@example.com

[2/25] Sending email to: jane@example.com (Jane Smith)
[2/25] ✅ Email sent successfully to jane@example.com

...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total members: 25
✅ Successfully sent: 24
❌ Failed: 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔌 MongoDB connection closed

✨ Script completed!
```

## Safety Features

- **Non-destructive**: Only reads from the database, doesn't modify waitlist entries
- **Error handling**: Continues processing even if individual emails fail
- **Rate limiting**: 500ms delay between emails to avoid Gmail rate limits
- **Progress tracking**: Shows real-time progress for each email
- **Detailed reporting**: Provides summary of success/failure counts

## Notes

- This is a **one-time script** - run it once to notify existing members
- New signups will automatically receive emails through the integrated feature
- If you need to re-run for specific users, consider adding filtering logic
- Check Gmail's sending limits if you have a large waitlist (typically 500/day for regular Gmail)

## Troubleshooting

### Script fails with "MongoDB connection error"
- Verify `MONGODB_URI` is set correctly in `.env`
- Check MongoDB server is running and accessible

### Emails not sending
- Verify `EMAIL_USER` and `EMAIL_PASS` are set correctly in `.env`
- Check the Gmail app password is valid
- Ensure "Less secure app access" is enabled (if using app password)

### Rate limiting errors
- Increase the delay between emails (change `500` to a higher value like `1000`)
- Consider running in smaller batches
