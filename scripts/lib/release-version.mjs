/** Apple requires a numeric Major.Minor.Patch marketing version. Preserve the
 * full beta/build identifier in package.json and runtime-manifest.json.
 * https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleshortversionstring */
export function appleMarketingVersion(version) {
  if (typeof version !== "string") throw new Error("Expected a semantic release version.");
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
  if (!match) throw new Error("Expected a semantic release version.");
  return `${match[1]}.${match[2]}.${match[3]}`;
}
