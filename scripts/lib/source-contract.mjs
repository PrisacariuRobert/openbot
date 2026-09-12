export function includesStringLiteral(source, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(["'\\x60])${escaped}\\1`).test(source);
}

export function includesText(source, value) {
  return source.toLocaleLowerCase("en-US").includes(value.toLocaleLowerCase("en-US"));
}
