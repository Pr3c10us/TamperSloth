import type {DailySpend, SpendAlert} from "../../internals/domain/spend";

const usd = (micros: number) => `$${(micros / 1e6).toFixed(2)}`

/** The operator's email when today's global Sloth spend nears or reaches its limit. */
export default function SpendAlertEmail(alert: SpendAlert, today: DailySpend) {
    const used = usd(today.spentMicros)
    const limit = usd(today.limitMicros)
    const percent = today.limitMicros > 0 ? Math.round(today.spentMicros / today.limitMicros * 100) : 100
    const subject = alert === "tripped"
        ? `TamperSloth: daily spend limit reached, Sloth models paused (${used} of ${limit})`
        : `TamperSloth: ${percent}% of today's spend limit used (${used} of ${limit})`
    const lead = alert === "tripped"
        ? `All users' Sloth model usage reached today's limit of ${limit}. Sloth models are refused until 00:00 UTC; users can still use models on their own API keys.`
        : `All users' Sloth model usage has cost ${used} today, ${percent}% of the ${limit} daily limit. At the limit, Sloth models are refused for everyone until 00:00 UTC.`
    const howTo = [
        "See where today stands:  SELECT * FROM spend_limit_today;",
        "Change the limit:        UPDATE spend_limit SET daily_limit_usd = 100;",
    ]
    const text = `${lead}\n\n${howTo.join("\n")}\n`
    const html = `<!DOCTYPE html>
<html lang="en">
<body style="margin: 0; padding: 24px; font-family: Arial, Helvetica, sans-serif; background-color: #f7f7f7; color: #0d0d0d;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border: 1px solid #ebebeb; border-radius: 10px; padding: 32px;">
    <h1 style="font-size: 20px; margin: 0 0 12px 0;">${alert === "tripped" ? "Daily spend limit reached" : "Approaching the daily spend limit"}</h1>
    <p style="font-size: 15px; line-height: 1.5; margin: 0 0 20px 0; color: #444444;">${lead}</p>
    <p style="font-size: 28px; font-weight: bold; margin: 0 0 20px 0;">${used} <span style="font-size: 15px; font-weight: normal; color: #8e8e8e;">of ${limit} (${percent}%)</span></p>
    <pre style="font-size: 12px; line-height: 1.6; background-color: #f4f4f4; border-radius: 6px; padding: 12px; margin: 0; white-space: pre-wrap;">${howTo.join("\n")}</pre>
  </div>
</body>
</html>`
    return {subject, text, html}
}
