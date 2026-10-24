export type Mail = {
    to: string
    subject: string
    text: string
    html: string
}

export interface Mailer {
    send: (mail: Mail) => Promise<void>
}

/** Lets one alert per key through in a window, across server instances. */
export interface AlertThrottle {
    claim: (key: string, seconds: number) => Promise<boolean>
}
