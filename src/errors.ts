export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

export class ManualActionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualActionRequiredError";
  }
}
