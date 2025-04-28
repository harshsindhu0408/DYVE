export function generateForgotPasswordEmail(otp) {
  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Password Reset OTP</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: #0f0f2f;
          color: #ffffff;
          line-height: 1.6;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background: linear-gradient(135deg, #1f1f3f, #1a1a2e);
          border-radius: 16px;
          padding: 40px;
          box-shadow: 0 0 20px rgba(0, 255, 255, 0.15);
          border: 1px solid rgba(0, 255, 255, 0.1);
        }
        h1 {
          font-size: 24px;
          text-align: center;
          color: #00ffff;
          margin-bottom: 24px;
          letter-spacing: 1px;
        }
        .otp-box {
          background: #101030;
          padding: 16px 24px;
          border-radius: 12px;
          text-align: center;
          font-size: 28px;
          font-weight: bold;
          color: #00ffff;
          box-shadow: 0 0 12px #00ffff33;
          margin: 20px 0;
          letter-spacing: 5px;
        }
        p {
          font-size: 16px;
          color: #cccccc;
          text-align: center;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 14px;
          color: #888;
          border-top: 1px solid #222;
          padding-top: 20px;
        }
        @media only screen and (max-width: 600px) {
          .container {
            padding: 24px;
          }
          .otp-box {
            font-size: 24px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 Reset Your Password</h1>
        <p>We received a request to reset your password. Use the OTP below to proceed:</p>
        <div class="otp-box">${otp}</div>
        <p>This OTP is valid for <strong>10 minutes</strong>. If you didn’t request this, please ignore this email.</p>
        <p style="margin-top: 30px;">Stay secure, stay futuristic 👾</p>
        <div class="footer">
          &copy; ${new Date().getFullYear()} DYVE Chat<br />
          Need help? <a href="mailto:support@justgetleads.com" style="color: #00ffff;">Contact Support</a>
        </div>
      </div>
    </body>
  </html>
    `;
}

export function generatePasswordResetConfirmationEmail(location) {
  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Password Reset Confirmation</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: #0f0f2f;
          color: #ffffff;
          line-height: 1.6;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background: linear-gradient(135deg, #1f1f3f, #1a1a2e);
          border-radius: 16px;
          padding: 40px;
          box-shadow: 0 0 20px rgba(0, 255, 255, 0.15);
          border: 1px solid rgba(0, 255, 255, 0.1);
        }
        h1 {
          font-size: 24px;
          text-align: center;
          color: #00ffff;
          margin-bottom: 24px;
          letter-spacing: 1px;
        }
        .location-box {
          background: #101030;
          padding: 16px 24px;
          border-radius: 12px;
          text-align: center;
          font-size: 18px;
          font-weight: bold;
          color: #00ffff;
          box-shadow: 0 0 12px #00ffff33;
          margin: 20px 0;
        }
        p {
          font-size: 16px;
          color: #cccccc;
          text-align: center;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 14px;
          color: #888;
          border-top: 1px solid #222;
          padding-top: 20px;
        }
        @media only screen and (max-width: 600px) {
          .container {
            padding: 24px;
          }
          .location-box {
            font-size: 16px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✅ Password Successfully Reset</h1>
        <p>Your password has just been changed.</p>
        <p>If this was you, no further action is needed.</p>
        <div class="location-box">📍 ${location}</div>
        <p>If you didn’t initiate this change, please contact support immediately or secure your account.</p>
        <p style="margin-top: 30px;">Stay secure, stay futuristic 👾</p>
        <div class="footer">
          &copy; ${new Date().getFullYear()} DYVE | CHAT<br />
          Need help? <a href="mailto:support@justgetleads.com" style="color: #00ffff;">Contact Support</a>
        </div>
      </div>
    </body>
  </html>
  `;
}

export function generateLoginOTPEmail(otp) {
  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background: #f9f9f9; padding: 40px 20px; min-height: 100vh; display: flex; justify-content: center; align-items: center;">
      <div style="background: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.1); padding: 40px 30px; max-width: 500px; width: 100%;">
        <div style="background: linear-gradient(135deg, #6C63FF, #48A9FE); border-radius: 10px 10px 0 0; padding: 20px; text-align: center;">
          <h2 style="margin: 0; color: #ffffff; font-size: 26px;">🔒 Secure Login OTP</h2>
        </div>
        <div style="padding: 30px 20px; text-align: center;">
          <p style="font-size: 18px; color: #333; margin-bottom: 10px;">Your one-time password (OTP) is:</p>
          <div style="background: #f0f4ff; padding: 15px 20px; border-radius: 8px; font-size: 32px; font-weight: bold; color: #3f51b5; letter-spacing: 4px; display: inline-block; margin: 20px 0;">
            ${otp}
          </div>
          <p style="font-size: 14px; color: #666; margin-top: 20px;">This OTP is valid for <strong>10 minutes</strong>. Please do not share it with anyone.</p>
          <p style="font-size: 14px; color: #999; margin-top: 10px;">If you didn't request this OTP, please ignore this email.</p>
        </div>
        <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px; text-align: center;">
          <p style="font-size: 12px; color: #aaa;">Best regards,<br><strong>DYVE | CHAT</strong></p>
        </div>
      </div>
    </div>
  `;
}
