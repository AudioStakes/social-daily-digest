import { CliError } from "../errors.js";

export async function promptHidden(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new CliError("A TTY is required to enter credentials securely.");
  }

  return await new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = "";

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };

    const finish = (callback: () => void) => {
      cleanup();
      stdout.write("\n");
      callback();
    };

    const onData = (buffer: Buffer) => {
      const text = buffer.toString("utf8");

      if (text === "\u0003") {
        finish(() => reject(new CliError("Credential input cancelled.")));
        return;
      }

      if (text === "\r" || text === "\n") {
        finish(() => resolve(value));
        return;
      }

      if (text === "\u007f") {
        value = value.slice(0, -1);
        return;
      }

      value += text;
    };

    stdout.write(label);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.on("data", onData);
  });
}
