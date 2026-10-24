const escapeHtml = (text: string) => text.replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]!)

/** The operator's email when billing needs a person: a duplicate subscription, a refund, an event that can't apply. */
export default function BillingAlertEmail(title: string, detail: string) {
    const subject = `TamperSloth billing: ${title}`
    const text = `${detail}\n`
    const html = `<!DOCTYPE html>
<html lang="en">
<body style="margin: 0; padding: 24px; font-family: Arial, Helvetica, sans-serif; background-color: #f7f7f7; color: #0d0d0d;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border: 1px solid #ebebeb; border-radius: 10px; padding: 32px;">
    <h1 style="font-size: 20px; margin: 0 0 12px 0;">${escapeHtml(title)}</h1>
    <p style="font-size: 15px; line-height: 1.5; margin: 0; color: #444444; white-space: pre-wrap;">${escapeHtml(detail)}</p>
  </div>
</body>
</html>`
    return {subject, text, html}
}
