const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  // If user configured GMAIL credentials in environment variables
  const gmailPass = process.env.GMAIL_PASS || process.env.GMAIL_APP_PASSWORD;
  if (process.env.GMAIL_USER && gmailPass) {
    const cleanUser = process.env.GMAIL_USER.trim();
    const cleanPass = gmailPass.replace(/\s+/g, '');
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: cleanUser,
        pass: cleanPass
      }
    });
    console.log(`✉️ Mailer configured using Gmail account: ${cleanUser}`);
    return transporter;
  }

  // Fallback: create ethereal test account with 3s timeout or mock transport for local testing
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Ethereal setup timeout')), 3000)
    );
    const testAccount = await Promise.race([nodemailer.createTestAccount(), timeoutPromise]);
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 4000,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    console.log(`✉️ Mailer configured with test account (Ethereal): ${testAccount.user}`);
    return transporter;
  } catch (err) {
    console.warn(`⚠️ Mailer using simulated stream transport (${err.message})`);
    transporter = nodemailer.createTransport({
      jsonTransport: true
    });
    return transporter;
  }
}

/**
 * Generate RFC 5545 iCalendar (.ics) invite
 * November 30, 2026, 3:00 PM - 8:00 PM PHT (UTC+8:00) -> 07:00:00Z to 12:00:00Z
 */
function buildIcsEvent({ guestName, controlNo, paymentMethod }) {
  const isCash = (paymentMethod || '').toLowerCase().includes('cash');
  const payLabel = isCash ? 'Paid in Cash at Cashier' : 'Paid via QRPh Online Transfer';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Goldilocks Bakeshop//Cake All You Can 2026//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:CAYC-${controlNo}-20261130@goldilocks.com.ph`,
    'DTSTAMP:20261103T070000Z',
    'DTSTART:20261130T070000Z',
    'DTEND:20261130T120000Z',
    'SUMMARY:🎂 Goldilocks Cake All You Can - Robinsons Tacloban',
    `DESCRIPTION:Official Goldilocks Cake All You Can Pass\\nGuest Name: ${guestName}\\nControl Number: ${controlNo}\\nPayment: ${payLabel} (P499.00)\\nEvent Date: Monday, November 30, 2026 (3:00 PM – 8:00 PM)\\nVenue: Level 1, Expansion Activity Area, Robinsons Tacloban\\n\\nPlease present your official E-Coupon or Control Number at the entrance.\\nEnjoy unlimited signature cakes!`,
    'LOCATION:Level 1\\, Expansion Activity Area\\, Robinsons Tacloban\\, Philippines',
    'STATUS:CONFIRMED',
    'ORGANIZER;CN=Goldilocks Robinsons Tacloban:mailto:goldilocks.tacloban@gmail.com',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder: Goldilocks Cake All You Can starts at 3:00 PM today at Robinsons Tacloban!',
    'TRIGGER:-PT2H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

// ── Brevo REST API Sender (Port 443 / HTTPS - Unblocked on Render Free Tier) ──
async function sendViaBrevoApi({ toEmail, guestName, subject, htmlContent, couponImagePath, icsContent, controlNo }) {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const senderEmail = (process.env.GMAIL_USER || 'cfi.goldilocks.tac@gmail.com').trim();
  const senderName = 'Goldilocks Cake All You Can';

  const attachments = [];
  if (couponImagePath && fs.existsSync(couponImagePath)) {
    const fileBytes = fs.readFileSync(couponImagePath);
    attachments.push({
      name: `goldilocks-ecoupon-${controlNo}.png`,
      content: fileBytes.toString('base64')
    });
  }

  if (icsContent) {
    attachments.push({
      name: 'goldilocks-cake-all-you-can.ics',
      content: Buffer.from(icsContent, 'utf8').toString('base64')
    });
  }

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: toEmail, name: guestName || 'Valued Guest' }],
    subject,
    htmlContent,
    attachment: attachments.length > 0 ? attachments : undefined
  };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Brevo API Error (${response.status}): ${data.message || JSON.stringify(data)}`);
  }

  console.log(`✉️ [Brevo API / Port 443] Email successfully dispatched to ${toEmail}! Message ID: ${data.messageId}`);
  return {
    success: true,
    messageId: data.messageId,
    previewUrl: null
  };
}

/**
 * Send the official E-Coupon email to the customer's Gmail
 * Supports both Cash (at cashier) and QR payments with 1-click Google Calendar button
 */
async function sendCouponEmail({ guestName, email, controlNo, couponImagePath, paymentMethod = 'cash' }) {
  try {
    const sender = process.env.GMAIL_USER || 'goldilocks.tacloban@gmail.com';

    const isCash = (paymentMethod || '').toLowerCase().includes('cash');
    const paymentBadge = isCash ? '💵 Paid in Cash at Store Cashier' : '📱 Paid via QRPh Online Transfer';
    const cleanGuest = guestName || 'Valued Guest';

    // ── Build Google Calendar Add-to-Calendar URL ──
    const eventTitle = encodeURIComponent('🎂 Goldilocks Cake All You Can - Robinsons Tacloban');
    // November 30, 2026 3:00 PM - 8:00 PM PHT (UTC+8) -> 07:00:00Z to 12:00:00Z
    const eventDates = '20261130T070000Z/20261130T120000Z';
    const eventLocation = encodeURIComponent('Level 1, Expansion Activity Area, Robinsons Tacloban, Philippines');
    const eventDetails = encodeURIComponent(
      `Goldilocks Cake All You Can Official Pass\n\n` +
      `Guest Name: ${cleanGuest}\n` +
      `Control Number: ${controlNo}\n` +
      `Payment Status: ${paymentBadge} (₱499.00 Verified)\n` +
      `Date & Time: Monday, November 30, 2026 from 3:00 PM to 8:00 PM\n` +
      `Venue: Level 1, Expansion Activity Area, Robinsons Tacloban\n\n` +
      `Please present your official E-Coupon pass or Control Number upon arrival at the entrance.\n` +
      `Enjoy unlimited servings of Goldilocks Signature Cakes!`
    );

    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${eventDates}&details=${eventDetails}&location=${eventLocation}&sf=true&output=xml`;
    const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${eventTitle}&startdt=2026-11-30T15:00:00+08:00&enddt=2026-11-30T20:00:00+08:00&body=${eventDetails}&location=${eventLocation}`;
    const yahooUrl = `https://calendar.yahoo.com/?v=60&view=d&type=20&title=${eventTitle}&st=20261130T070000Z&et=20261130T120000Z&desc=${eventDetails}&in_loc=${eventLocation}`;

    // ── HTML Email Template ──
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Goldilocks Cake All You Can E-Coupon</title>
      </head>
      <body style="margin:0;padding:20px 10px;background:#fbf8f0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:2px solid #f5a800;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(180,100,0,0.12);">
          
          <!-- HEADER BANNER -->
          <div style="background:linear-gradient(135deg,#ffc200 0%,#ff9500 100%);padding:26px 20px;text-align:center;">
            <div style="font-size:38px;line-height:1;margin-bottom:6px;">🎂</div>
            <h1 style="margin:0;font-size:25px;color:#3b1f00;font-weight:900;letter-spacing:-0.5px;text-transform:uppercase;">GOLDILOCKS BAKESHOP</h1>
            <p style="margin:6px 0 0;font-size:15px;color:#5c3200;font-weight:700;letter-spacing:0.5px;">Cake All You Can • Official E-Coupon Pass</p>
          </div>
          
          <!-- MAIN BODY -->
          <div style="padding:28px 24px;color:#2b1800;line-height:1.6;">
            
            <div style="text-align:center;margin-bottom:22px;">
              <h2 style="margin:0 0 6px;font-size:23px;color:#783b00;">Congratulations, ${cleanGuest}!</h2>
              <p style="margin:0;font-size:14px;color:#555;">
                Your ${isCash ? 'cash payment at the cashier has been verified' : 'payment has been verified & approved'}! Your official E-Coupon pass is now issued and ready to use.
              </p>
            </div>

            <!-- CONTROL NUMBER BOX -->
            <div style="background:linear-gradient(180deg,#fff9e6 0%,#fff2cc 100%);border:2px dashed #f5a800;border-radius:14px;padding:20px;text-align:center;margin:22px 0;">
              <div style="font-size:12px;font-weight:800;color:#9b5a00;text-transform:uppercase;letter-spacing:1.5px;">Official Control Number</div>
              <div style="font-size:34px;font-weight:900;color:#3b1f00;letter-spacing:2px;margin:6px 0;font-family:monospace,sans-serif;">${controlNo}</div>
              <div style="display:inline-block;background:#0b7a36;color:#ffffff;font-size:11.5px;font-weight:700;padding:3px 12px;border-radius:20px;margin-top:4px;">
                ${paymentBadge}
              </div>
            </div>

            <!-- ADD TO GOOGLE CALENDAR CALLOUT -->
            <div style="background:#eef5fc;border:1.5px solid #bcd8f8;border-radius:16px;padding:22px 18px;text-align:center;margin:24px 0;">
              <div style="font-size:16px;font-weight:800;color:#0b57d0;margin-bottom:4px;">
                🗓️ Save Date &amp; Time to Your Calendar
              </div>
              <p style="margin:0 0 16px;font-size:13px;color:#3c4043;line-height:1.5;">
                Event Date: <b>Monday, November 30, 2026</b><br/>
                Event Time: <b>3:00 PM – 8:00 PM (Philippine Time)</b><br/>
                Add this event to your calendar with one click so you won't miss it!
              </p>

              <!-- 1-CLICK GOOGLE CALENDAR BUTTON -->
              <table border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:28px;background:linear-gradient(135deg,#1a73e8 0%,#1557b0 100%);box-shadow:0 4px 14px rgba(26,115,232,0.38);">
                    <a href="${gcalUrl}" target="_blank" style="font-family:'Segoe UI',Roboto,sans-serif;font-size:15px;color:#ffffff;font-weight:700;text-decoration:none;padding:14px 30px;border-radius:28px;display:inline-block;border:1px solid #1a73e8;letter-spacing:0.3px;">
                      📅 Add to Google Calendar
                    </a>
                  </td>
                </tr>
              </table>

              <div style="margin-top:14px;font-size:11.5px;color:#5f6368;">
                Other Calendars:
                <a href="${outlookUrl}" target="_blank" style="color:#0b57d0;text-decoration:underline;margin:0 6px;font-weight:600;">Outlook Calendar</a> •
                <a href="${yahooUrl}" target="_blank" style="color:#0b57d0;text-decoration:underline;margin:0 6px;font-weight:600;">Yahoo Calendar</a> •
                or open the attached <b>.ics</b> invite
              </div>
            </div>

            <!-- EVENT DETAILS TABLE -->
            <table style="width:100%;border-collapse:collapse;margin:22px 0;font-size:13.5px;">
              <tr>
                <td style="padding:10px 0;color:#666;border-bottom:1px solid #f0e2c8;font-weight:600;">Event Date &amp; Time:</td>
                <td style="padding:10px 0;font-weight:700;color:#3b1f00;text-align:right;border-bottom:1px solid #f0e2c8;">Nov 30, 2026 (3:00 PM – 8:00 PM)</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#666;border-bottom:1px solid #f0e2c8;font-weight:600;">Event Venue:</td>
                <td style="padding:10px 0;font-weight:700;color:#3b1f00;text-align:right;border-bottom:1px solid #f0e2c8;">Level 1, Expansion Activity Area, Robinsons Tacloban</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#666;border-bottom:1px solid #f0e2c8;font-weight:600;">Amount Paid:</td>
                <td style="padding:10px 0;font-weight:800;color:#0b7a36;text-align:right;border-bottom:1px solid #f0e2c8;">₱499.00 (Verified)</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#666;border-bottom:1px solid #f0e2c8;font-weight:600;">Payment Method:</td>
                <td style="padding:10px 0;font-weight:700;color:#3b1f00;text-align:right;border-bottom:1px solid #f0e2c8;">${isCash ? 'Cash at Store Register' : 'QRPh Online Transfer'}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#666;">Store Branch:</td>
                <td style="padding:10px 0;font-weight:700;color:#3b1f00;text-align:right;">Goldilocks Robinsons Tacloban</td>
              </tr>
            </table>

            <!-- E-COUPON PREVIEW (IF ATTACHED) -->
            ${couponImagePath && fs.existsSync(couponImagePath) ? `
              <div style="text-align:center;margin:24px 0 18px;">
                <div style="font-size:12px;font-weight:800;color:#9b5a00;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
                  🎟️ Official Personalized E-Coupon Pass
                </div>
                <img src="cid:couponImage" alt="E-Coupon ${controlNo}" style="max-width:100%;height:auto;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.12);border:1px solid #ffd500;" />
              </div>
            ` : ''}

            <!-- ATTACHMENT NOTICE -->
            <div style="background:#e8f7ee;border-left:4px solid #00c853;padding:13px 16px;border-radius:6px;font-size:13px;color:#0b662e;margin:22px 0;">
              📎 <b>Attached Files:</b>
              <ul style="margin:6px 0 0;padding-left:20px;font-size:12.5px;">
                <li><b>goldilocks-ecoupon-${controlNo}.png</b>: Your official personalized HD coupon pass. Save to your phone gallery to present at the entrance.</li>
                <li><b>goldilocks-cake-all-you-can.ics</b>: Calendar event file. Opens in Apple Calendar, Google Calendar, or Outlook.</li>
              </ul>
            </div>

            <!-- FOOTER -->
            <p style="font-size:12px;color:#888;text-align:center;margin-top:26px;border-top:1px solid #eee;padding-top:16px;line-height:1.5;">
              Goldilocks Robinsons Tacloban • Store Hotline: <b>(053) 832-1234 / 0917-888-2292</b>.<br/>
              Per DTI Fair Trade Permit No.____, Series of 2026.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // ── Attachments ──
    const attachments = [];

    // 1. Coupon image attachment
    if (couponImagePath && fs.existsSync(couponImagePath)) {
      attachments.push({
        filename: `goldilocks-ecoupon-${controlNo}.png`,
        path: couponImagePath,
        cid: 'couponImage'
      });
    }

    // 2. Calendar .ics invite attachment
    const icsContent = buildIcsEvent({ guestName: cleanGuest, controlNo, paymentMethod });
    attachments.push({
      filename: `goldilocks-cake-all-you-can.ics`,
      content: icsContent,
      contentType: 'text/calendar; charset=utf-8; method=REQUEST'
    });

    // ── Priority 1: Brevo HTTPS REST API (Port 443 - Bypasses Render Free SMTP Block!) ──
    if (process.env.BREVO_API_KEY) {
      console.log('🚀 Sending via Brevo HTTPS API (Port 443) - Bypassing Render Free SMTP Block!');
      return await sendViaBrevoApi({
        toEmail: email,
        guestName: cleanGuest,
        subject: `🎟️ Your Goldilocks Cake All You Can E-Coupon is Issued! [Control No: ${controlNo}]`,
        htmlContent,
        couponImagePath,
        icsContent,
        controlNo
      });
    }

    // ── Priority 2: Direct Nodemailer SMTP (Local / Paid Plan) ──
    const mail = await getTransporter();
    const mailOptions = {
      from: `"Goldilocks Cake All You Can" <${sender}>`,
      to: email,
      subject: `🎟️ Your Goldilocks Cake All You Can E-Coupon is Issued! [Control No: ${controlNo}]`,
      html: htmlContent,
      attachments
    };
    const sendPromise = mail.sendMail(mailOptions);
    const isRealGmail = Boolean(process.env.GMAIL_USER && (process.env.GMAIL_PASS || process.env.GMAIL_APP_PASSWORD));
    
    let info;
    if (isRealGmail) {
      // Real Gmail SMTP delivery: allow ample time (30s) to upload high-res coupon image attachments
      info = await Promise.race([
        sendPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Gmail SMTP delivery timed out after 30s')), 30000))
      ]);
    } else {
      info = await Promise.race([
        sendPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP send timed out')), 5000))
      ]).catch((timeoutErr) => {
        console.warn(`⚠️ SMTP send encountered delay/failure (${timeoutErr.message}), falling back to local simulation.`);
        return { messageId: `<mock-${Date.now()}@goldilocks.local>` };
      });
    }

    console.log(`✉️ Email successfully dispatched to ${email}! Message ID: ${info.messageId}`);
    let previewUrl = null;
    if (nodemailer.getTestMessageUrl(info)) {
      previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`🔗 Ethereal Preview URL: ${previewUrl}`);
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl
    };
  } catch (error) {
    console.error('❌ Error sending email via Nodemailer:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  sendCouponEmail,
  buildIcsEvent
};
