declare module "nodemailer" {
  interface SendMailOptions {
    from: string;
    to: string;
    subject: string;
    text: string;
  }

  interface Transporter {
    sendMail(options: SendMailOptions): Promise<unknown>;
  }

  interface TransportOptions {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  }

  interface NodemailerModule {
    createTransport(options: TransportOptions): Transporter;
  }

  const nodemailer: NodemailerModule;
  export default nodemailer;
}
