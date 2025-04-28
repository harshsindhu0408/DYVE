export const generateInviteEmail = ({
  workspaceName,
  inviterName,
  inviterAvatar,
  role,
  acceptUrl,
  expiryDays,
}) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Workspace Invitation</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f9f9f9;
            }
            .container {
                background-color: #ffffff;
                border-radius: 10px;
                padding: 30px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                text-align: center;
            }
            .header {
                margin-bottom: 25px;
            }
            .logo {
                color: #4f46e5;
                font-size: 30px;
                font-weight: bold;
                margin-bottom: 15px;
            }
            .avatar {
                width: 80px;
                height: 80px;
                border-radius: 50%;
                margin: 0 auto 20px;
                object-fit: cover;
            }
            h1 {
                color: #111827;
                font-size: 24px;
                margin-bottom: 20px;
            }
            .content {
                margin-bottom: 30px;
                text-align: center;
            }
            .button {
                display: inline-block;
                padding: 14px 28px;
                background-color: #4f46e5;
                color: white !important;
                text-decoration: none;
                border-radius: 6px;
                font-weight: 500;
                font-size: 16px;
                text-align: center;
                margin: 20px 0;
                transition: background-color 0.3s ease;
            }
            .button:hover {
                background-color: #4338ca;
            }
            .footer {
                text-align: center;
                font-size: 14px;
                color: #6b7280;
                margin-top: 30px;
            }
            .highlight {
                font-weight: 600;
                color: #111827;
            }
            .role-badge {
                display: inline-block;
                padding: 6px 12px;
                background-color: #e0e7ff;
                color: #4f46e5;
                border-radius: 20px;
                font-size: 16px;
                font-weight: 500;
                margin-top: 10px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">DYVE</div>
                ${
                  inviterAvatar
                    ? `<img src="${inviterAvatar}" alt="${inviterName}" class="avatar">`
                    : ""
                }
            </div>
            
            <h1>You've been invited to join <span class="highlight">${workspaceName}</span></h1>
            
            <div class="content">
                <p>Hello,</p>
                <p><span class="highlight">${inviterName}</span> has invited you to join the workspace <span class="highlight">${workspaceName}</span> as a <span class="role-badge">${role}</span> on DYVE.</p>
                
                <p>
                    <a href="${acceptUrl}" class="button">Accept Invitation</a>
                </p>
                
                <p>This invitation will expire in ${expiryDays} days. If you didn't request this invitation, you can safely ignore this email.</p>
            </div>
            
            <div class="footer">
                <p>© ${new Date().getFullYear()} DYVE. All rights reserved.</p>
                <p>If the button doesn't work, copy and paste this link into your browser:</p>
                <p><small><a href="${acceptUrl}">${acceptUrl}</a></small></p>
            </div>
        </div>
    </body>
    </html>
      `;
};
