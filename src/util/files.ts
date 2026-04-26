import { chmod, copyFile, mkdir, stat, writeFile } from "node:fs/promises";

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDirectory(targetPath: string): Promise<void> {
  await mkdir(targetPath, { recursive: true });
}

export async function writeTextFile(
  targetPath: string,
  contents: string,
): Promise<void> {
  await writeFile(targetPath, contents, "utf8");
}

export async function copyIfMissing(
  sourcePath: string,
  targetPath: string,
): Promise<boolean> {
  if (await pathExists(targetPath)) {
    return false;
  }

  await copyFile(sourcePath, targetPath);
  return true;
}

export async function chmodExecutable(targetPath: string): Promise<void> {
  await chmod(targetPath, 0o755);
}
