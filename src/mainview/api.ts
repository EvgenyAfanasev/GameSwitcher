import Electrobun, { Electroview } from "electrobun/view";
import type { GS_RPC } from "../shared/rpc";

type ViewRPC = {
  bun: GS_RPC["bun"];
  webview: {
    requests: {};
    messages: {};
  };
};

const rpc = Electroview.defineRPC<ViewRPC>({
  maxRequestTime: 60000,
  handlers: { requests: {}, messages: {} },
});

export const electrobun = new Electrobun.Electroview({ rpc });

type BunRequests = ViewRPC["bun"]["requests"];

export const api = {
  call<K extends keyof BunRequests>(
    method: K,
    ...args: BunRequests[K]["params"] extends Record<string, never> ? [] : [BunRequests[K]["params"]]
  ): Promise<BunRequests[K]["response"]> {
    return electrobun.rpc!.request[method](...(args as never[])) as Promise<BunRequests[K]["response"]>;
  },
};
