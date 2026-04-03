export function formatNames(values = []) {
  return values.map((value) => `\`${value}\``).join(', ');
}

export function formatCommandEntries(values = []) {
  return values
    .map((value) => {
      const name = String(value?.name || '').trim();
      const args = String(value?.args || '').trim();
      if (!name) return '';
      return `\`${args ? `${name} ${args}` : name}\``;
    })
    .filter(Boolean)
    .join(', ');
}

export function formatMcpResources(values = [], limit = 4) {
  return values
    .slice(0, limit)
    .map((value) => `\`${value.server}:${value.uri}\``)
    .join(', ');
}
