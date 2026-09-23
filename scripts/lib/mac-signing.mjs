// Keep public-distribution builds separate from unsigned development installers.
// The certificate and notary credentials are supplied at build time, never stored here.
export function signedMacBuilderArgs(env, platform = process.platform) {
  if (platform !== 'darwin') throw new Error('A signed Mac build must run on macOS.');
  if (!env.CSC_LINK || !env.CSC_KEY_PASSWORD) {
    throw new Error('A signed Mac build needs CSC_LINK and CSC_KEY_PASSWORD.');
  }
  const identity = env.CSC_NAME?.trim();
  if (!identity?.startsWith('Developer ID Application: ')) {
    throw new Error('CSC_NAME must name a Developer ID Application certificate.');
  }
  const apiKey = Boolean(env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER);
  const appleId = Boolean(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID);
  const keychain = Boolean(env.APPLE_KEYCHAIN && env.APPLE_KEYCHAIN_PROFILE);
  if (!apiKey && !appleId && !keychain) {
    throw new Error('A signed Mac build needs a complete Apple notarization credential set.');
  }
  return [
    `-c.mac.identity=${identity}`,
    '-c.mac.forceCodeSigning=true',
    '-c.mac.hardenedRuntime=true',
    '-c.mac.entitlements=build/entitlements.mac.plist',
    '-c.mac.entitlementsInherit=build/entitlements.mac.plist',
    '-c.mac.notarize=true',
  ];
}
