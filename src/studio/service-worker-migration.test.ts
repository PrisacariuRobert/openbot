import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

test("Studio replaces only its retired shell caches and keeps push delivery", async () => {
  const listeners = new Map<string, (event: {waitUntil:(promise:Promise<unknown>)=>void})=>void>();
  const removed:string[]=[], cached:string[]=[];
  let claimed = 0, skipped = 0;
  vm.runInNewContext(readFileSync(new URL("../../public/sw.js",import.meta.url),"utf8"),{
    self:{addEventListener:(name:string,listener:typeof listeners extends Map<string,infer L>?L:never)=>listeners.set(name,listener),skipWaiting:()=>{skipped++;},clients:{claim:()=>{claimed++;}}},
    caches:{keys:async()=>["openbot-shell-v3","unrelated-app-cache","openbot-studio-v4"],delete:async(key:string)=>{removed.push(key);},open:async()=>({addAll:async(urls:string[])=>{cached.push(...urls);}})},
  });
  let completion:Promise<unknown>=Promise.resolve();
  const event = {waitUntil:(promise:Promise<unknown>)=>{completion=promise;}};
  listeners.get("install")!(event); await completion;
  listeners.get("activate")!(event); await completion;
  assert.deepEqual(removed,["openbot-shell-v3"]);
  assert.ok(cached.includes("/")); assert.equal(claimed,1); assert.equal(skipped,1);
  assert.ok(listeners.has("push")); assert.ok(listeners.has("notificationclick"));
});
