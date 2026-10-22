import nodemailer, {type Transporter} from "nodemailer";
import type {Mail, Mailer} from "../../domain/mail";
import type {SMTPCredentials} from "../../../packages/secret";

export default class SMTPMailer implements Mailer {
    private transport: Transporter
    private from: string

    constructor(credentials: SMTPCredentials) {
        this.from = credentials.fromAddress
        this.transport = nodemailer.createTransport({
            host: credentials.host,
            port: credentials.port,
            // 465 speaks TLS from the start; other ports upgrade with STARTTLS.
            secure: credentials.port === 465,
            auth: {user: credentials.username, pass: credentials.password},
        })
    }

    async send(mail: Mail): Promise<void> {
        await this.transport.sendMail({from: this.from, ...mail})
    }
}
