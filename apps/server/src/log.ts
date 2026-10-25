export function log(
  event: string,
  fields: Record<string, string | number | boolean> = {},
) {
  // Do not log invite codes, names, chat, media URLs, headers or credentials.
  process.stdout.write(
    JSON.stringify({ time: new Date().toISOString(), event, ...fields }) + "\n",
  );
}
