export function formatNames(values = []) {
  return values.map((value) => `\`${value}\``).join(', ');
}

export function formatMcpResources(values = [], limit = 4) {
  return values
    .slice(0, limit)
    .map((value) => `\`${value.server}:${value.uri}\``)
    .join(', ');
}
