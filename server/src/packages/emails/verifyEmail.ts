export default function VerifyEmail(url: string, logo: string) {
    return `
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Verify your email</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    /* Reset styles */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    
    /* Client-specific styles */
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; min-width: 100% !important; }
    .ReadMsgBody { width: 100%; }
    .ExternalClass { width: 100%; }
    .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }
    
    /* Main styles */
    body {
      font-family: Arial, Helvetica, sans-serif;
      background-color: #f7f7f7;
      color: #0d0d0d;
      margin: 0;
      padding: 0;
    }
    
    .email-wrapper {
      width: 100%;
      background-color: #f7f7f7;
      padding: 32px 0;
    }
    
    .email-container {
      max-width: 420px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #ebebeb;
      border-radius: 10px;
      overflow: hidden;
    }
    
    .email-content {
      padding: 40px 32px;
      text-align: center;
    }
    
    .logo {
      width: 64px;
      height: 64px;
      margin: 0 auto 24px;
      display: block;
    }
    
    .email-title {
      font-size: 24px;
      font-weight: bold;
      margin: 0 0 12px 0;
      color: #0d0d0d;
      line-height: 1.3;
    }
    
    .email-text {
      font-size: 16px;
      line-height: 1.5;
      margin: 0 0 24px 0;
      color: #8e8e8e;
    }
    
    .btn-container {
      margin: 24px 0;
    }
    
    .btn {
      display: inline-block;
      background-color: #e95757;
      color: #ffffff;
      padding: 14px 24px;
      border-radius: 10px;
      text-decoration: none;
      font-weight: bold;
      font-size: 16px;
      mso-padding-alt: 0;
      text-align: center;
    }
    
    .btn:hover {
      background-color: #d64848 !important;
    }
    
    .footer-text {
      font-size: 14px;
      color: #8e8e8e;
      line-height: 1.4;
      margin: 32px 0 0 0;
    }
    
    .footer-link {
      color: #e95757;
      text-decoration: none;
      word-break: break-all;
    }
    
    /* Mobile responsive */
    @media only screen and (max-width: 480px) {
      .email-wrapper {
        padding: 16px 0;
      }
      
      .email-container {
        margin: 0 16px;
        max-width: none;
      }
      
      .email-content {
        padding: 32px 24px;
      }
      
      .email-title {
        font-size: 20px;
      }
      
      .email-text {
        font-size: 14px;
      }
      
      .btn {
        font-size: 14px;
        padding: 12px 20px;
      }
      
      .footer-text {
        font-size: 12px;
      }
    }
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .email-wrapper {
        background-color: #1a1a1a !important;
      }
      
      .email-container {
        background-color: #2d2d2d !important;
        border-color: #404040 !important;
      }
      
      .email-title {
        color: #ffffff !important;
      }
      
      .email-text {
        color: #b3b3b3 !important;
      }
      
      .footer-text {
        color: #b3b3b3 !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f7f7f7;">
  <!--[if mso]>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr>
      <td>
  <![endif]-->
  
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f7f7f7;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        
        <!-- Email Container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="420" style="max-width: 420px; background-color: #ffffff; border: 1px solid #ebebeb; border-radius: 10px;">
          <tr>
            <td style="padding: 40px 32px; text-align: center;">
              
              <!-- Logo -->
              <img src="${logo}" alt="Logo" width="64" height="64" style="display: block; margin: 0 auto 24px; width: 64px; height: 64px; border: 0;">
              
              <!-- Title -->
              <h1 style="font-size: 24px; font-weight: bold; margin: 0 0 12px 0; color: #0d0d0d; line-height: 1.3; font-family: Arial, Helvetica, sans-serif;">Verify your email</h1>
              
              <!-- Text -->
              <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px 0; color: #8e8e8e; font-family: Arial, Helvetica, sans-serif;">Thanks for signing up! Please click the button below to confirm your email address and get started.</p>
              
              <!-- Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 24px auto;">
                <tr>
                  <td style="border-radius: 10px; background-color: #e95757;">
                    <a href="${url}" style="display: inline-block; background-color: #e95757; color: #ffffff; padding: 14px 24px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 16px; font-family: Arial, Helvetica, sans-serif;">Verify Email</a>
                  </td>
                </tr>
              </table>
              
              <!-- Footer -->
              <p style="font-size: 14px; color: #8e8e8e; line-height: 1.4; margin: 32px 0 0 0; font-family: Arial, Helvetica, sans-serif;">
                If the button doesn't work <a href="${url}" style="color: #e95757; text-decoration: none; word-break: break-all; font-family: Arial, Helvetica, sans-serif;"> click here</a>
              </p>
              
            </td>
          </tr>
        </table>
        
      </td>
    </tr>
  </table>
  
  <!--[if mso]>
      </td>
    </tr>
  </table>
  <![endif]-->
</body>
</html>
    `
}