export type DownloadRoute = { kind: "latest"; file: string } | { kind: "release"; tag: string; file: string };
export function routeDownload(pathname: string): DownloadRoute | null;
declare const worker: { fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }): Promise<Response> };
export default worker;
